-- =====================================================================
-- WITS — Migration 003: Transfer Barcode Label Printing
-- Honeywell PD43, 100x150mm labels, Code128 barcodes
--
-- Run this in the Supabase SQL Editor AFTER schema.sql and
-- migration_002_transfer_receiving.sql have already been applied.
--
-- DESIGN NOTE: this is a DELIBERATELY SEPARATE set of tables from
-- transfer_master (the blind-receiving module). Even though the barcode
-- naming convention looks similar, this spec assigns upload/printing to
-- the Warehouse Officer role, while transfer_master's import is
-- Production-only — merging them would blur that segregation of duties.
-- If you actually want one shared barcode pool for both receiving and
-- label printing, that's a bigger restructuring — ask and it can be
-- done, but it is NOT what this migration does.
--
-- Access: Production, Warehouse Officer, and Admin can all upload and
-- print labels (see is_label_printer_user() below).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Role helper: who can upload/print pallet labels.
-- ---------------------------------------------------------------------
create or replace function public.is_label_printer_user()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role in ('admin', 'production', 'warehouse_officer') and is_active = true
  );
$$;

-- ---------------------------------------------------------------------
-- Small helper: parse a date string without blowing up the whole
-- validation batch if one row has a bad date.
-- ---------------------------------------------------------------------
create or replace function public.safe_to_date(p_text text)
returns date
language plpgsql immutable
as $$
begin
  return p_text::date;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Table: pallet_label_batches  (one row per Excel upload)
-- ---------------------------------------------------------------------
create table if not exists public.pallet_label_batches (
  id                 uuid primary key default gen_random_uuid(),
  batch_number       text unique,
  filename           text not null,
  uploaded_by        uuid not null references public.users(id) default auth.uid(),
  uploaded_at        timestamptz not null default now(),
  total_records      integer not null default 0,
  imported_records   integer not null default 0,
  duplicate_records  integer not null default 0,
  invalid_records    integer not null default 0,
  status             text not null default 'processing'
);

create sequence if not exists public.pallet_label_batch_seq start 1;

create or replace function public.set_pallet_label_batch_number()
returns trigger language plpgsql as $$
begin
  if new.batch_number is null or new.batch_number = '' then
    new.batch_number := 'LBL-' || to_char(now(), 'YYYYMMDD') || '-' ||
                         lpad(nextval('public.pallet_label_batch_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_pallet_label_batch_number on public.pallet_label_batches;
create trigger trg_set_pallet_label_batch_number
  before insert on public.pallet_label_batches
  for each row execute function public.set_pallet_label_batch_number();

-- ---------------------------------------------------------------------
-- Table: pallet_label_staging  (Excel rows land here first)
-- ---------------------------------------------------------------------
create table if not exists public.pallet_label_staging (
  id                    uuid primary key default gen_random_uuid(),
  batch_id              uuid not null references public.pallet_label_batches(id) on delete cascade,
  row_number            integer not null,
  transfer_barcode      text,
  item_code             text,
  description           text,
  quantity_raw          text,
  quantity              numeric,
  uom                   text,
  destination_warehouse text,
  production_date_raw   text,
  production_date       date,
  pallet_number         text,
  validation_status     text,   -- null until processed; then 'valid' | 'invalid' | 'duplicate_in_file' | 'duplicate_in_db'
  validation_errors     text[],
  created_at            timestamptz not null default now()
);

create index if not exists idx_pallet_staging_batch on public.pallet_label_staging (batch_id);
create index if not exists idx_pallet_staging_barcode on public.pallet_label_staging (transfer_barcode);

-- ---------------------------------------------------------------------
-- Table: pallet_labels  (the "Transfer Records" grid — one row = one
-- pallet label that can be printed)
-- ---------------------------------------------------------------------
create table if not exists public.pallet_labels (
  id                     uuid primary key default gen_random_uuid(),
  transfer_barcode       text not null unique,
  item_code              text not null,
  description            text not null,
  quantity               numeric not null,
  uom                    text not null,
  destination_warehouse  text not null,
  production_date        date not null,
  pallet_number          text not null,
  batch_id               uuid references public.pallet_label_batches(id),
  print_count            integer not null default 0,
  last_printed_at        timestamptz,
  last_printed_by        uuid references public.users(id),
  created_at             timestamptz not null default now()
);

create index if not exists idx_pallet_labels_barcode on public.pallet_labels (transfer_barcode);
create index if not exists idx_pallet_labels_batch on public.pallet_labels (batch_id);

-- ---------------------------------------------------------------------
-- Table: label_print_history
-- ---------------------------------------------------------------------
create table if not exists public.label_print_history (
  id                uuid primary key default gen_random_uuid(),
  pallet_label_id   uuid references public.pallet_labels(id) on delete set null,
  transfer_barcode  text not null,
  printed_by        uuid references public.users(id),
  printed_at        timestamptz not null default now(),
  printer_name      text,
  print_status      text not null default 'Sent to Printer',
  is_reprint        boolean not null default false
);

create index if not exists idx_label_print_history_barcode on public.label_print_history (transfer_barcode);

-- =====================================================================
-- Import processing: Excel (already inserted into staging by the
-- client) -> validation -> promotion into pallet_labels.
-- =====================================================================
create or replace function public.process_pallet_label_import(p_batch_id uuid)
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
  if not public.is_label_printer_user() then
    raise exception 'Only Production, Warehouse Officer, or Admin users can upload transfer label files.';
  end if;

  if not exists (select 1 from public.pallet_label_batches where id = p_batch_id) then
    raise exception 'Import batch not found.';
  end if;

  -- 1) Duplicate Transfer Barcodes within the same uploaded file: keep
  -- the first occurrence as a normal candidate, flag the rest.
  with ranked as (
    select id, row_number() over (partition by transfer_barcode order by row_number) as rn
    from public.pallet_label_staging
    where batch_id = p_batch_id
  )
  update public.pallet_label_staging s
  set validation_status = 'duplicate_in_file',
      validation_errors = array['Duplicate Transfer Barcode within uploaded file']
  from ranked r
  where s.id = r.id and r.rn > 1;

  -- 2) Parse numeric quantity and date into real typed columns.
  update public.pallet_label_staging s
  set quantity = case
        when s.quantity_raw ~ '^[0-9]+(\.[0-9]+)?$' and s.quantity_raw::numeric > 0 then s.quantity_raw::numeric
        else null
      end,
      production_date = public.safe_to_date(s.production_date_raw)
  where s.batch_id = p_batch_id and s.validation_status is null;

  -- 3) Field-level validation for whatever's left.
  update public.pallet_label_staging s
  set validation_errors = case
    when coalesce(trim(s.transfer_barcode), '') = '' and coalesce(trim(s.item_code), '') = ''
         and coalesce(trim(s.quantity_raw), '') = '' and coalesce(trim(s.pallet_number), '') = ''
      then array['Blank row']
    else (
      select array_remove(array[
        case when coalesce(trim(s.transfer_barcode), '') = '' then 'Missing Transfer Barcode' end,
        case when coalesce(trim(s.item_code), '') = '' then 'Missing Item Code' end,
        case when coalesce(trim(s.description), '') = '' then 'Missing Description' end,
        case when coalesce(trim(s.uom), '') = '' then 'Missing UOM' end,
        case when coalesce(trim(s.destination_warehouse), '') = '' then 'Missing Destination Warehouse' end,
        case when coalesce(trim(s.pallet_number), '') = '' then 'Missing Pallet Number' end,
        case when coalesce(trim(s.quantity_raw), '') = '' then 'Missing Quantity'
             when s.quantity is null then 'Invalid Quantity' end,
        case when coalesce(trim(s.production_date_raw), '') = '' then 'Missing Production Date'
             when s.production_date is null then 'Invalid Production Date' end,
        case when not exists (select 1 from public.products p where p.item_code = s.item_code and p.is_active)
          then 'Item Code not found in Products' end,
        case when exists (select 1 from public.pallet_labels pl where pl.transfer_barcode = s.transfer_barcode)
          then 'Transfer Barcode already exists in database' end
      ], null)
    )
  end
  where s.batch_id = p_batch_id and s.validation_status is null;

  update public.pallet_label_staging s
  set validation_status = case
    when exists (select 1 from public.pallet_labels pl where pl.transfer_barcode = s.transfer_barcode)
      then 'duplicate_in_db'
    when array_length(s.validation_errors, 1) is null or array_length(s.validation_errors, 1) = 0
      then 'valid'
    else 'invalid'
  end
  where s.batch_id = p_batch_id and s.validation_status is null;

  -- 4) Promote valid rows into the live pallet_labels table.
  insert into public.pallet_labels
    (transfer_barcode, item_code, description, quantity, uom, destination_warehouse, production_date, pallet_number, batch_id)
  select s.transfer_barcode, s.item_code, s.description, s.quantity, s.uom, s.destination_warehouse,
         s.production_date, s.pallet_number, p_batch_id
  from public.pallet_label_staging s
  where s.batch_id = p_batch_id and s.validation_status = 'valid';

  -- 5) Roll counts up onto the batch header.
  select count(*) into v_total from public.pallet_label_staging where batch_id = p_batch_id;
  select count(*) into v_valid from public.pallet_label_staging where batch_id = p_batch_id and validation_status = 'valid';
  select count(*) into v_invalid from public.pallet_label_staging where batch_id = p_batch_id and validation_status = 'invalid';
  select count(*) into v_dup_file from public.pallet_label_staging where batch_id = p_batch_id and validation_status = 'duplicate_in_file';
  select count(*) into v_dup_db from public.pallet_label_staging where batch_id = p_batch_id and validation_status = 'duplicate_in_db';

  update public.pallet_label_batches
  set total_records = v_total,
      imported_records = v_valid,
      invalid_records = v_invalid,
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
-- Print history logging. Called once per label AFTER the browser's
-- print dialog has closed (see frontend notes) — this can only record
-- that a print job was SENT, not that the physical label actually came
-- out, since no browser can get that confirmation back from a printer.
-- =====================================================================
create or replace function public.record_label_print(
  p_transfer_barcode text,
  p_printer_name text default null,
  p_is_reprint boolean default false
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_label_id uuid;
begin
  if not public.is_label_printer_user() then
    raise exception 'Only Production, Warehouse Officer, or Admin users can print labels.';
  end if;

  select id into v_label_id from public.pallet_labels where transfer_barcode = p_transfer_barcode;
  if v_label_id is null then
    raise exception 'Unknown Transfer Barcode: %', p_transfer_barcode;
  end if;

  insert into public.label_print_history (pallet_label_id, transfer_barcode, printed_by, printer_name, is_reprint)
  values (v_label_id, p_transfer_barcode, auth.uid(), p_printer_name, p_is_reprint);

  update public.pallet_labels
  set print_count = print_count + 1,
      last_printed_at = now(),
      last_printed_by = auth.uid()
  where id = v_label_id;
end;
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.pallet_label_batches enable row level security;
alter table public.pallet_label_staging enable row level security;
alter table public.pallet_labels enable row level security;
alter table public.label_print_history enable row level security;

-- Shared visibility among all Warehouse Officers (this is a shared
-- printing station, not a per-person workspace) — adjust to
-- `uploaded_by = auth.uid() or is_label_printer_user()` instead if you want
-- per-officer isolation like the Production import module has.
drop policy if exists pallet_label_batches_select on public.pallet_label_batches;
create policy pallet_label_batches_select on public.pallet_label_batches
  for select using (public.is_label_printer_user());

drop policy if exists pallet_label_batches_insert on public.pallet_label_batches;
create policy pallet_label_batches_insert on public.pallet_label_batches
  for insert with check (public.is_label_printer_user());

drop policy if exists pallet_label_staging_select on public.pallet_label_staging;
create policy pallet_label_staging_select on public.pallet_label_staging
  for select using (public.is_label_printer_user());

drop policy if exists pallet_label_staging_insert on public.pallet_label_staging;
create policy pallet_label_staging_insert on public.pallet_label_staging
  for insert with check (public.is_label_printer_user());

-- pallet_labels: read-only for clients. All writes go through
-- process_pallet_label_import() and record_label_print().
drop policy if exists pallet_labels_select on public.pallet_labels;
create policy pallet_labels_select on public.pallet_labels
  for select using (public.is_label_printer_user());

-- Uncomment to let other roles VIEW (not print) the records grid, per
-- the spec's "Other users may only view transfer records if permitted":
-- create policy pallet_labels_select_others on public.pallet_labels
--   for select using (true);  -- or restrict to specific roles as needed

drop policy if exists label_print_history_select on public.label_print_history;
create policy label_print_history_select on public.label_print_history
  for select using (public.is_label_printer_user());

-- No insert/update/delete policies for clients on pallet_labels or
-- label_print_history — everything goes through the SECURITY DEFINER
-- functions above.

-- Wrapped so this file can be safely re-run without erroring if these
-- tables were already added to the publication in a previous run.
do $$
begin
  alter publication supabase_realtime add table public.pallet_labels;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.pallet_label_batches;
exception when duplicate_object then null;
end $$;
