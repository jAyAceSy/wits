-- =====================================================================
-- WITS — Migration 004: Unified Transfer Scanning
-- Merges "New Transfer" (ad-hoc) and "Receive Transfer" (blind count)
-- into one flow, both backed by transfer_master.
--
-- Run this AFTER migration_002_transfer_receiving.sql.
--
-- WHAT THIS ADDS to transfer_master:
--   entry_type            'transfer_barcode' | 'ad_hoc'
--   production_area       (ad-hoc entries only)
--   destination_warehouse (ad-hoc entries only)
--   remarks               (ad-hoc entries only, optional)
--
-- Ad-hoc entries are created with transferred_quantity = received_quantity
-- and status = 'Received' immediately — there's no "expected" value to
-- compare against, so no variance is possible and they never enter the
-- Warehouse Officer review queue.
--
-- The blind-count guarantee for Transfer-Barcode entries is now
-- PERMANENT, not just during counting: receiver_my_transfers() below is
-- the only way a Receiver can see their own history, and its return
-- type deliberately excludes transferred_quantity, variance, AND status
-- (status differences like "Received" vs "Pending Warehouse Officer
-- Review" would themselves leak whether a mismatch occurred).
-- =====================================================================

alter table public.transfer_master
  add column if not exists entry_type text not null default 'transfer_barcode'
    check (entry_type in ('transfer_barcode', 'ad_hoc')),
  add column if not exists production_area text,
  add column if not exists destination_warehouse text,
  add column if not exists remarks text;

create sequence if not exists public.adhoc_transfer_seq start 1;

-- =====================================================================
-- Ad-hoc entry: no pre-declared Transfer Barcode exists, so the
-- Receiver scans a Product barcode or types an Item Code instead, and
-- declares the quantity themselves (matches the original, pre-blind-
-- receiving "New Transfer" behavior, minus multi-item grouping).
-- =====================================================================
create or replace function public.submit_adhoc_transfer(
  p_code text,               -- product barcode OR item code, tried in that order
  p_quantity numeric,
  p_production_area text,
  p_destination_warehouse text,
  p_remarks text default null
)
returns text  -- the generated reference (synthetic transfer_barcode)
language plpgsql security definer set search_path = public
as $$
declare
  v_product record;
  v_barcode text;
begin
  if not public.is_receiver_user() then
    raise exception 'Not authorized to record transfers.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;
  if coalesce(trim(p_production_area), '') = '' then
    raise exception 'Production Area is required.';
  end if;
  if coalesce(trim(p_destination_warehouse), '') = '' then
    raise exception 'Destination Warehouse is required.';
  end if;

  select id, item_code, description, uom into v_product
  from public.products
  where is_active and (barcode = p_code or item_code = p_code)
  limit 1;

  if not found then
    raise exception 'Unknown Barcode or Item Code: "%" is not registered in Products.', p_code;
  end if;

  v_barcode := 'ADHOC-' || to_char(now(), 'YYYYMMDD') || '-' ||
               lpad(nextval('public.adhoc_transfer_seq')::text, 5, '0');

  insert into public.transfer_master (
    transfer_barcode, item_code, description, uom, transferred_quantity, status,
    received_quantity, received_by, received_at, variance,
    entry_type, production_area, destination_warehouse, remarks
  ) values (
    v_barcode, v_product.item_code, v_product.description, v_product.uom, p_quantity, 'Received',
    p_quantity, auth.uid(), now(), 0,
    'ad_hoc', trim(p_production_area), trim(p_destination_warehouse), nullif(trim(p_remarks), '')
  );

  return v_barcode;
end;
$$;

-- =====================================================================
-- Receiver's own history. Deliberately returns ONLY what the receiver
-- themselves entered. No transferred_quantity, no variance, no status —
-- permanently, not just during the counting step.
-- =====================================================================
create or replace function public.receiver_my_transfers()
returns table (
  transfer_barcode text,
  item_code text,
  description text,
  uom text,
  received_quantity numeric,
  received_at timestamptz,
  entry_type text
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_receiver_user() then
    raise exception 'Not authorized.';
  end if;

  return query
    select tm.transfer_barcode, tm.item_code, tm.description, tm.uom,
           tm.received_quantity, tm.received_at, tm.entry_type
    from public.transfer_master tm
    where tm.received_by = auth.uid()
    order by tm.received_at desc
    limit 500;
end;
$$;
