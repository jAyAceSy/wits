-- =====================================================================
-- WITS — Warehouse Inventory Transfer System
-- Supabase / PostgreSQL schema
--
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New
-- query) on a fresh project. It is idempotent-ish (uses IF NOT EXISTS /
-- OR REPLACE where possible) but is intended to be run top-to-bottom on
-- a clean database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'warehouse_staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transfer_status as enum ('draft', 'submitted', 'voided');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Table: users
-- One row per Supabase Auth user (public profile + role).
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null unique,
  role        user_role not null default 'warehouse_staff',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Auto-create a public.users profile whenever a new auth.users row appears.
-- Admins create people via Supabase Auth (dashboard, Admin API, or the
-- "Invite" flow) and pass full_name/role in raw_user_meta_data.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'warehouse_staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Table: products  (the single master table)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  barcode      text not null unique,
  item_code    text not null,
  description  text not null,
  uom          text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_products_item_code on public.products (item_code);
create index if not exists idx_products_description on public.products using gin (to_tsvector('simple', description));

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Table: transfer_headers
-- ---------------------------------------------------------------------
create table if not exists public.transfer_headers (
  id                       uuid primary key default gen_random_uuid(),
  transfer_number          text unique,
  transfer_date            date not null default current_date,
  created_at               timestamptz not null default now(),
  warehouse_receiver       text,
  production_area          text,
  destination_warehouse    text,
  remarks                  text,
  status                   transfer_status not null default 'draft',
  created_by               uuid not null references public.users(id) default auth.uid(),
  total_items              integer not null default 0,
  total_qty                numeric not null default 0
);

create index if not exists idx_transfer_headers_created_by on public.transfer_headers (created_by);
create index if not exists idx_transfer_headers_status on public.transfer_headers (status);
create index if not exists idx_transfer_headers_date on public.transfer_headers (transfer_date);

-- Auto-generate a readable, unique transfer number: TRF-YYYYMMDD-00001
create sequence if not exists public.transfer_number_seq start 1;

create or replace function public.set_transfer_number()
returns trigger language plpgsql as $$
begin
  if new.transfer_number is null or new.transfer_number = '' then
    new.transfer_number := 'TRF-' || to_char(now(), 'YYYYMMDD') || '-' ||
                            lpad(nextval('public.transfer_number_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_transfer_number on public.transfer_headers;
create trigger trg_set_transfer_number
  before insert on public.transfer_headers
  for each row execute function public.set_transfer_number();

-- Require key header fields + at least one item before a transfer can move
-- from draft -> submitted. This is the server-side safety net behind the
-- UI validation.
create or replace function public.validate_transfer_submit()
returns trigger language plpgsql as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    if new.warehouse_receiver is null or trim(new.warehouse_receiver) = '' then
      raise exception 'Warehouse Receiver is required.';
    end if;
    if new.production_area is null or trim(new.production_area) = '' then
      raise exception 'Production Area is required.';
    end if;
    if new.destination_warehouse is null or trim(new.destination_warehouse) = '' then
      raise exception 'Destination Warehouse is required.';
    end if;
    if not exists (select 1 from public.transfer_details where transfer_id = new.id) then
      raise exception 'At least one scanned item is required before submitting.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_transfer_submit on public.transfer_headers;
create trigger trg_validate_transfer_submit
  before update on public.transfer_headers
  for each row execute function public.validate_transfer_submit();

-- ---------------------------------------------------------------------
-- Table: transfer_details
-- One barcode scan = one line. UNIQUE(transfer_id, barcode) is what
-- prevents duplicate barcode entries within the same transfer.
-- ---------------------------------------------------------------------
create table if not exists public.transfer_details (
  id            uuid primary key default gen_random_uuid(),
  transfer_id   uuid not null references public.transfer_headers(id) on delete cascade,
  product_id    uuid not null references public.products(id),
  barcode       text not null,
  item_code     text not null,
  description   text not null,
  uom           text not null,
  quantity      numeric not null check (quantity > 0),
  scanned_at    timestamptz not null default now(),
  unique (transfer_id, barcode)
);

create index if not exists idx_transfer_details_transfer_id on public.transfer_details (transfer_id);
create index if not exists idx_transfer_details_barcode on public.transfer_details (barcode);
create index if not exists idx_transfer_details_item_code on public.transfer_details (item_code);

-- Keep transfer_headers.total_items / total_qty automatically in sync
-- with the scanned lines. This is what makes every scan "immediately
-- saved" and reflected everywhere without extra client round-trips.
create or replace function public.recalc_transfer_totals()
returns trigger language plpgsql as $$
declare
  v_transfer_id uuid := coalesce(new.transfer_id, old.transfer_id);
begin
  update public.transfer_headers th
  set total_items = sub.cnt,
      total_qty   = sub.qty
  from (
    select count(*) as cnt, coalesce(sum(quantity), 0) as qty
    from public.transfer_details
    where transfer_id = v_transfer_id
  ) sub
  where th.id = v_transfer_id;
  return null;
end;
$$;

drop trigger if exists trg_recalc_transfer_totals on public.transfer_details;
create trigger trg_recalc_transfer_totals
  after insert or update or delete on public.transfer_details
  for each row execute function public.recalc_transfer_totals();

-- ---------------------------------------------------------------------
-- Table: audit_logs
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.users(id),
  action       text not null,
  table_name   text not null,
  record_id    uuid,
  details      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_audit_logs_table on public.audit_logs (table_name, created_at desc);

create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_record_id uuid;
  v_details jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'INSERT'; v_record_id := new.id; v_details := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'UPDATE'; v_record_id := new.id;
    v_details := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  elsif tg_op = 'DELETE' then
    v_action := 'DELETE'; v_record_id := old.id; v_details := to_jsonb(old);
  end if;

  insert into public.audit_logs (user_id, action, table_name, record_id, details)
  values (auth.uid(), v_action, tg_table_name, v_record_id, v_details);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_products on public.products;
create trigger trg_audit_products
  after insert or update or delete on public.products
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_transfer_headers on public.transfer_headers;
create trigger trg_audit_transfer_headers
  after update on public.transfer_headers
  for each row execute function public.log_audit();

drop trigger if exists trg_audit_users on public.users;
create trigger trg_audit_users
  after insert or update on public.users
  for each row execute function public.log_audit();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.users            enable row level security;
alter table public.products         enable row level security;
alter table public.transfer_headers enable row level security;
alter table public.transfer_details enable row level security;
alter table public.audit_logs       enable row level security;

-- Helper: is the current JWT holder an active admin?
-- SECURITY DEFINER lets this bypass RLS on `users` so it doesn't recurse.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

-- ---------- users ----------
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists users_update on public.users;
create policy users_update on public.users
  for update using (public.is_admin()) with check (public.is_admin());

-- No client-side INSERT/DELETE policy: profiles are created by the
-- trg_handle_new_auth_user trigger, and users are deactivated
-- (is_active = false) rather than deleted.

-- ---------- products ----------
drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select using (auth.uid() is not null);

drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert with check (public.is_admin());

drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete using (public.is_admin());

-- ---------- transfer_headers ----------
drop policy if exists transfer_headers_select on public.transfer_headers;
create policy transfer_headers_select on public.transfer_headers
  for select using (created_by = auth.uid() or public.is_admin());

drop policy if exists transfer_headers_insert on public.transfer_headers;
create policy transfer_headers_insert on public.transfer_headers
  for insert with check (created_by = auth.uid());

drop policy if exists transfer_headers_update on public.transfer_headers;
create policy transfer_headers_update on public.transfer_headers
  for update
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

-- Submitted transfers are permanent and can never be deleted. Only an
-- untouched draft (e.g. the user backed out of "New Transfer") may be
-- removed, and only by the person who started it.
drop policy if exists transfer_headers_delete on public.transfer_headers;
create policy transfer_headers_delete on public.transfer_headers
  for delete using (created_by = auth.uid() and status = 'draft');

-- ---------- transfer_details ----------
drop policy if exists transfer_details_select on public.transfer_details;
create policy transfer_details_select on public.transfer_details
  for select using (
    exists (
      select 1 from public.transfer_headers th
      where th.id = transfer_id and (th.created_by = auth.uid() or public.is_admin())
    )
  );

drop policy if exists transfer_details_insert on public.transfer_details;
create policy transfer_details_insert on public.transfer_details
  for insert with check (
    exists (
      select 1 from public.transfer_headers th
      where th.id = transfer_id and th.created_by = auth.uid() and th.status = 'draft'
    )
  );

drop policy if exists transfer_details_update on public.transfer_details;
create policy transfer_details_update on public.transfer_details
  for update using (
    exists (
      select 1 from public.transfer_headers th
      where th.id = transfer_id and th.created_by = auth.uid() and th.status = 'draft'
    )
  );

drop policy if exists transfer_details_delete on public.transfer_details;
create policy transfer_details_delete on public.transfer_details
  for delete using (
    exists (
      select 1 from public.transfer_headers th
      where th.id = transfer_id and th.created_by = auth.uid() and th.status = 'draft'
    )
  );

-- ---------- audit_logs ----------
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select using (public.is_admin());

-- No insert/update/delete policies for clients: rows are written only by
-- the SECURITY DEFINER log_audit() trigger function.

-- =====================================================================
-- Realtime (optional but recommended): lets the dashboard/history pages
-- update live when other warehouse users submit transfers.
-- =====================================================================
alter publication supabase_realtime add table public.transfer_headers;
alter publication supabase_realtime add table public.transfer_details;
