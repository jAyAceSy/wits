-- =====================================================================
-- WITS — Migration 002: Transfer Barcode Receiving
-- Excel Import + Blind Receiving + Independent Variance Review
--
-- Run this in the Supabase SQL Editor AFTER schema.sql has already been
-- applied. Safe to run on top of your existing, already-live database —
-- it only adds new tables/functions/roles, it does not touch your
-- existing users/products/transfer_headers/transfer_details/audit_logs.
--
-- IMPORTANT SECURITY NOTE FOR REVIEWERS:
-- The Receiver role is never granted SELECT on transfer_master at all —
-- not row-level-restricted, not column-masked, simply no policy exists
-- for that role on that table. The only way a Receiver can read a
-- transfer is through receiver_lookup_transfer(), a function whose
-- RETURNS TABLE signature structurally does not include
-- transferred_quantity or variance. There is no code path — buggy
-- frontend, direct REST call, browser dev tools — through which those
-- values can reach a Receiver's session. Likewise, transfer_master has
-- NO client-facing INSERT/UPDATE policy at all: every write happens
-- through a SECURITY DEFINER function that checks role, re-validates
-- state, and locks the row, so the "compare in the backend only" and
-- "a barcode can only be received once" rules can't be bypassed by
-- calling the REST API directly instead of the app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- New roles
-- ---------------------------------------------------------------------
alter type user_role add value if not exists 'production';
alter type user_role add value if not exists 'warehouse_officer';

-- If Supabase's SQL editor complains about "unsafe use of new value of
-- enum type" anywhere below, it means your editor ran this whole file as
-- one transaction. Just run the two ALTER TYPE lines above by
-- themselves first (select them, run), then run the rest of this file
-- as a second query.

-- ---------------------------------------------------------------------
-- Role helper functions (mirror the is_admin() pattern in schema.sql)
-- ---------------------------------------------------------------------
create or replace function public.is_officer()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role in ('admin', 'warehouse_officer') and is_active = true
  );
$$;

create or replace function public.is_production_user()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role in ('admin', 'production') and is_active = true
  );
$$;

create or replace function public.is_receiver_user()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role in ('admin', 'warehouse_staff') and is_active = true
  );
$$;

-- ---------------------------------------------------------------------
-- Table: transfer_import_batches  (Upload History / Import Logs)
-- ---------------------------------------------------------------------
create table if not exists public.transfer_import_batches (
  id                   uuid primary key default gen_random_uuid(),
  import_id            text unique,
  filename             text not null,
  uploaded_by          uuid not null references public.users(id) default auth.uid(),
  uploaded_at          timestamptz not null default now(),
  total_records        integer not null default 0,
  successful_records   integer not null default 0,
  failed_records       integer not null default 0,
  duplicate_records    integer not null default 0,
  status               text not null default 'processing'
);

create sequence if not exists public.import_id_seq start 1;

create or replace function public.set_import_id()
returns trigger language plpgsql as $$
begin
  if new.import_id is null or new.import_id = '' then
    new.import_id := 'IMP-' || to_char(now(), 'YYYYMMDD') || '-' ||
                      lpad(nextval('public.import_id_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_import_id on public.transfer_import_batches;
create trigger trg_set_import_id
  before insert on public.transfer_import_batches
  for each row execute function public.set_import_id();

-- ---------------------------------------------------------------------
-- Table: transfer_import_staging  (Excel rows land here first)
-- ---------------------------------------------------------------------
create table if not exists public.transfer_import_staging (
  id                        uuid primary key default gen_random_uuid(),
  import_batch_id           uuid not null references public.transfer_import_batches(id) on delete cascade,
  row_number                integer not null,
  transfer_barcode          text,
  item_code                 text,
  description                text,
  uom                        text,
  transferred_quantity_raw  text,
  transferred_quantity      numeric,
  validation_status          text,   -- null until processed; then 'valid' | 'invalid' | 'duplicate_in_file' | 'duplicate_in_db'
  validation_errors          text[],
  created_at                 timestamptz not null default now()
);

create index if not exists idx_staging_batch on public.transfer_import_staging (import_batch_id);
create index if not exists idx_staging_barcode on public.transfer_import_staging (transfer_barcode);
create index if not exists idx_staging_status on public.transfer_import_staging (validation_status);

-- ---------------------------------------------------------------------
-- Table: transfer_master  (validated transfers, ready to be received)
-- ---------------------------------------------------------------------
create table if not exists public.transfer_master (
  id                     uuid primary key default gen_random_uuid(),
  transfer_barcode       text not null unique,
  item_code              text not null,
  description            text not null,
  uom                    text not null,
  transferred_quantity   numeric not null,   -- NEVER selectable by the Receiver role — see policies below
  status                 text not null default 'Pending',
  import_batch_id        uuid references public.transfer_import_batches(id),
  created_at             timestamptz not null default now(),
  received_quantity      numeric,
  received_by            uuid references public.users(id),
  received_at            timestamptz,
  variance               numeric,
  reviewed_by            uuid references public.users(id),
  reviewed_at            timestamptz,
  review_remarks         text,
  reopened_count         integer not null default 0
);

create index if not exists idx_transfer_master_barcode on public.transfer_master (transfer_barcode);
create index if not exists idx_transfer_master_status on public.transfer_master (status);
create index if not exists idx_transfer_master_import_batch on public.transfer_master (import_batch_id);

-- ---------------------------------------------------------------------
-- Table: transfer_audit_trail  (full, undeletable history of every
-- transfer's lifecycle — populated only by trigger, never by clients)
-- ---------------------------------------------------------------------
create table if not exists public.transfer_audit_trail (
  id                     uuid primary key default gen_random_uuid(),
  transfer_master_id     uuid references public.transfer_master(id) on delete set null,
  transfer_barcode       text not null,
  import_batch_id        uuid references public.transfer_import_batches(id),
  event                  text not null,
  previous_status        text,
  new_status             text,
  transferred_quantity   numeric,
  received_quantity      numeric,
  variance               numeric,
  performed_by           uuid references public.users(id),
  remarks                text,
  created_at             timestamptz not null default now()
);

create index if not exists idx_transfer_audit_barcode on public.transfer_audit_trail (transfer_barcode);
create index if not exists idx_transfer_audit_master on public.transfer_audit_trail (transfer_master_id);

create or replace function public.log_transfer_master_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.transfer_audit_trail
      (transfer_master_id, transfer_barcode, import_batch_id, event, new_status, transferred_quantity, performed_by)
    values
      (new.id, new.transfer_barcode, new.import_batch_id, 'created', new.status, new.transferred_quantity, auth.uid());
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.transfer_audit_trail
      (transfer_master_id, transfer_barcode, import_batch_id, event, previous_status, new_status,
       transferred_quantity, received_quantity, variance, performed_by, remarks)
    values
      (new.id, new.transfer_barcode, new.import_batch_id,
       case new.status
         when 'Received' then 'received'
         when 'Pending Warehouse Officer Review' then 'sent_for_review'
         when 'Approved with Variance' then 'approved'
         when 'Rejected' then 'rejected'
         when 'Under Investigation' then 'investigating'
         when 'Pending' then 'reopened'
         else lower(new.status)
       end,
       old.status, new.status, new.transferred_quantity, new.received_quantity, new.variance,
       auth.uid(), new.review_remarks);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transfer_master_audit on public.transfer_master;
create trigger trg_transfer_master_audit
  after insert or update on public.transfer_master
  for each row execute function public.log_transfer_master_audit();

-- =====================================================================
-- Import processing: Excel (already inserted into staging by the
-- client) -> validation -> promotion into transfer_master.
-- =====================================================================
create or replace function public.process_transfer_import(p_batch_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_total int;
  v_valid int;
  v_invalid int;
  v_dup_file int;
  v_dup_db int;
begin
  if not public.is_production_user() then
    raise exception 'Only Production users can process transfer imports.';
  end if;

  if not exists (
    select 1 from public.transfer_import_batches
    where id = p_batch_id and (uploaded_by = auth.uid() or public.is_admin())
  ) then
    raise exception 'Import batch not found, or it does not belong to you.';
  end if;

  -- 1) Duplicate Transfer Barcodes within the same uploaded file: keep
  -- the first occurrence as a normal candidate, flag the rest.
  with ranked as (
    select id, row_number() over (partition by transfer_barcode order by row_number) as rn
    from public.transfer_import_staging
    where import_batch_id = p_batch_id
  )
  update public.transfer_import_staging s
  set validation_status = 'duplicate_in_file',
      validation_errors = array['Duplicate Transfer Barcode within uploaded file']
  from ranked r
  where s.id = r.id and r.rn > 1;

  -- 2) Parse the raw quantity text into a real numeric where possible.
  update public.transfer_import_staging s
  set transferred_quantity = case
        when s.transferred_quantity_raw ~ '^[0-9]+(\.[0-9]+)?$' and s.transferred_quantity_raw::numeric > 0
          then s.transferred_quantity_raw::numeric
        else null
      end
  where s.import_batch_id = p_batch_id and s.validation_status is null;

  -- 3) Field-level validation for whatever's left.
  update public.transfer_import_staging s
  set validation_errors = case
    when coalesce(trim(s.transfer_barcode), '') = '' and coalesce(trim(s.item_code), '') = ''
         and coalesce(trim(s.uom), '') = '' and coalesce(trim(s.transferred_quantity_raw), '') = ''
      then array['Blank row']
    else (
      select array_remove(array[
        case when coalesce(trim(s.transfer_barcode), '') = '' then 'Missing Transfer Barcode' end,
        case when coalesce(trim(s.item_code), '') = '' then 'Missing Item Code' end,
        case when coalesce(trim(s.uom), '') = '' then 'Missing UOM' end,
        case when coalesce(trim(s.transferred_quantity_raw), '') = '' then 'Missing Transferred Quantity'
             when s.transferred_quantity is null then 'Invalid Transferred Quantity' end,
        case when not exists (select 1 from public.products p where p.item_code = s.item_code and p.is_active)
          then 'Invalid Item Code (not found in Products)' end,
        case when exists (
               select 1 from public.products p
               where p.item_code = s.item_code and p.is_active and p.uom <> s.uom
             ) then 'UOM does not match registered product' end,
        case when exists (select 1 from public.transfer_master tm where tm.transfer_barcode = s.transfer_barcode)
          then 'Transfer Barcode already exists in database' end
      ], null)
    )
  end
  where s.import_batch_id = p_batch_id and s.validation_status is null;

  update public.transfer_import_staging s
  set validation_status = case
    when exists (select 1 from public.transfer_master tm where tm.transfer_barcode = s.transfer_barcode)
      then 'duplicate_in_db'
    when array_length(s.validation_errors, 1) is null or array_length(s.validation_errors, 1) = 0
      then 'valid'
    else 'invalid'
  end
  where s.import_batch_id = p_batch_id and s.validation_status is null;

  -- 4) Promote valid rows into the live Transfer Master table.
  insert into public.transfer_master (transfer_barcode, item_code, description, uom, transferred_quantity, status, import_batch_id)
  select s.transfer_barcode, s.item_code, s.description, s.uom, s.transferred_quantity, 'Pending', p_batch_id
  from public.transfer_import_staging s
  where s.import_batch_id = p_batch_id and s.validation_status = 'valid';

  -- 5) Roll the counts up onto the batch header.
  select count(*) into v_total from public.transfer_import_staging where import_batch_id = p_batch_id;
  select count(*) into v_valid from public.transfer_import_staging where import_batch_id = p_batch_id and validation_status = 'valid';
  select count(*) into v_invalid from public.transfer_import_staging where import_batch_id = p_batch_id and validation_status = 'invalid';
  select count(*) into v_dup_file from public.transfer_import_staging where import_batch_id = p_batch_id and validation_status = 'duplicate_in_file';
  select count(*) into v_dup_db from public.transfer_import_staging where import_batch_id = p_batch_id and validation_status = 'duplicate_in_db';

  update public.transfer_import_batches
  set total_records = v_total,
      successful_records = v_valid,
      failed_records = v_invalid + v_dup_file + v_dup_db,
      duplicate_records = v_dup_file + v_dup_db,
      status = case when v_invalid + v_dup_file + v_dup_db = 0 then 'completed' else 'completed_with_errors' end
  where id = p_batch_id;

  return jsonb_build_object(
    'total', v_total, 'valid', v_valid, 'invalid', v_invalid,
    'duplicate_in_file', v_dup_file, 'duplicate_in_db', v_dup_db
  );
end;
$$;

-- =====================================================================
-- Blind receiving: lookup (safe columns only) + submit (backend-only
-- comparison).
-- =====================================================================
create or replace function public.receiver_lookup_transfer(p_barcode text)
returns table (
  transfer_barcode text,
  item_code text,
  description text,
  uom text,
  status text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_row record;
begin
  if not public.is_receiver_user() then
    raise exception 'Not authorized to receive transfers.';
  end if;

  select tm.transfer_barcode, tm.item_code, tm.description, tm.uom, tm.status
  into v_row
  from public.transfer_master tm
  where tm.transfer_barcode = p_barcode;

  if not found then
    raise exception 'Unknown Transfer Barcode. It has not been uploaded by Production yet.';
  end if;

  if v_row.status <> 'Pending' then
    raise exception 'This Transfer Barcode has already been processed.';
  end if;

  return query select v_row.transfer_barcode, v_row.item_code, v_row.description, v_row.uom, v_row.status;
end;
$$;

create or replace function public.submit_receiving(p_transfer_barcode text, p_received_qty numeric)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.transfer_master%rowtype;
  v_variance numeric;
  v_new_status text;
begin
  if not public.is_receiver_user() then
    raise exception 'Not authorized to receive transfers.';
  end if;

  if p_received_qty is null or p_received_qty <= 0 then
    raise exception 'Received quantity must be greater than zero.';
  end if;

  select * into v_row from public.transfer_master where transfer_barcode = p_transfer_barcode for update;

  if not found then
    raise exception 'Unknown Transfer Barcode. It has not been uploaded by Production yet.';
  end if;

  if v_row.status <> 'Pending' then
    raise exception 'This Transfer Barcode has already been processed.';
  end if;

  v_variance := p_received_qty - v_row.transferred_quantity;
  v_new_status := case when v_variance = 0 then 'Received' else 'Pending Warehouse Officer Review' end;

  update public.transfer_master
  set received_quantity = p_received_qty,
      received_by = auth.uid(),
      received_at = now(),
      variance = v_variance,
      status = v_new_status
  where id = v_row.id;

  -- Always the SAME message, whether it matched or not — this is what
  -- makes the blind count actually blind. If the wording ever differed
  -- based on outcome, a receiver could infer the variance from the
  -- message alone.
  return 'Receiving transaction submitted successfully.';
end;
$$;

-- =====================================================================
-- Warehouse Officer review + reopen
-- =====================================================================
create or replace function public.warehouse_officer_review(p_transfer_id uuid, p_action text, p_remarks text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.transfer_master%rowtype;
  v_new_status text;
begin
  if not public.is_officer() then
    raise exception 'Only Warehouse Officers can review variances.';
  end if;

  if p_action not in ('approve', 'reject', 'investigate') then
    raise exception 'Invalid action.';
  end if;

  select * into v_row from public.transfer_master where id = p_transfer_id for update;
  if not found then
    raise exception 'Transaction not found.';
  end if;

  if v_row.status not in ('Pending Warehouse Officer Review', 'Under Investigation') then
    raise exception 'This transaction is not awaiting review.';
  end if;

  v_new_status := case p_action
    when 'approve' then 'Approved with Variance'
    when 'reject' then 'Rejected'
    when 'investigate' then 'Under Investigation'
  end;

  update public.transfer_master
  set status = v_new_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_remarks = p_remarks
  where id = p_transfer_id;
end;
$$;

create or replace function public.reopen_transfer(p_transfer_id uuid, p_remarks text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.transfer_master%rowtype;
begin
  if not public.is_officer() then
    raise exception 'Only Warehouse Officers can reopen transactions.';
  end if;

  select * into v_row from public.transfer_master where id = p_transfer_id for update;
  if not found then
    raise exception 'Transaction not found.';
  end if;

  if v_row.status not in ('Received', 'Approved with Variance', 'Rejected', 'Under Investigation') then
    raise exception 'Only completed transactions can be reopened.';
  end if;

  update public.transfer_master
  set status = 'Pending',
      received_quantity = null,
      received_by = null,
      received_at = null,
      variance = null,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_remarks = coalesce(p_remarks, 'Reopened for re-receiving'),
      reopened_count = reopened_count + 1
  where id = p_transfer_id;
end;
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.transfer_import_batches enable row level security;
alter table public.transfer_import_staging enable row level security;
alter table public.transfer_master enable row level security;
alter table public.transfer_audit_trail enable row level security;

-- ---------- transfer_import_batches ----------
drop policy if exists import_batches_select on public.transfer_import_batches;
create policy import_batches_select on public.transfer_import_batches
  for select using (uploaded_by = auth.uid() or public.is_officer());

drop policy if exists import_batches_insert on public.transfer_import_batches;
create policy import_batches_insert on public.transfer_import_batches
  for insert with check (public.is_production_user() and uploaded_by = auth.uid());

-- No update/delete policy: batch header is only ever rolled up by
-- process_transfer_import(), which runs as a SECURITY DEFINER function.

-- ---------- transfer_import_staging ----------
drop policy if exists import_staging_select on public.transfer_import_staging;
create policy import_staging_select on public.transfer_import_staging
  for select using (
    public.is_officer() or exists (
      select 1 from public.transfer_import_batches b
      where b.id = import_batch_id and b.uploaded_by = auth.uid()
    )
  );

drop policy if exists import_staging_insert on public.transfer_import_staging;
create policy import_staging_insert on public.transfer_import_staging
  for insert with check (
    public.is_production_user() and exists (
      select 1 from public.transfer_import_batches b
      where b.id = import_batch_id and b.uploaded_by = auth.uid()
    )
  );

-- No update/delete policy: validation is only ever written by
-- process_transfer_import().

-- ---------- transfer_master ----------
-- Deliberately the ONLY policy on this table. Receivers get NO select
-- policy at all — their only access path is receiver_lookup_transfer(),
-- whose return type structurally excludes transferred_quantity/variance.
-- There is also no insert/update/delete policy for any client role —
-- every write happens through a SECURITY DEFINER function.
drop policy if exists transfer_master_select on public.transfer_master;
create policy transfer_master_select on public.transfer_master
  for select using (public.is_officer());

-- ---------- transfer_audit_trail ----------
drop policy if exists transfer_audit_select on public.transfer_audit_trail;
create policy transfer_audit_select on public.transfer_audit_trail
  for select using (public.is_officer());

-- No insert/update/delete policy for clients: rows are written only by
-- the trg_transfer_master_audit trigger. No audit record can ever be
-- deleted by any client role, satisfying "no audit records may be
-- deleted."

-- =====================================================================
-- Realtime (optional): lets the Variance Review queue and dashboards
-- update live as receiving happens on other devices.
-- Wrapped so this file can be safely re-run without erroring if these
-- tables were already added to the publication in a previous run.
-- =====================================================================
do $$
begin
  alter publication supabase_realtime add table public.transfer_master;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.transfer_import_batches;
exception when duplicate_object then null;
end $$;
