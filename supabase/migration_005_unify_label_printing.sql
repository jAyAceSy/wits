-- =====================================================================
-- WITS — Migration 005: Unify Label Printing with Transfer Management
--
-- Previously, Label Printing had its own separate Excel upload
-- (pallet_labels / pallet_label_batches / pallet_label_staging),
-- disconnected from the Transfer Management upload that Production
-- already does for the receiving workflow (transfer_master). This
-- migration makes transfer_master the single shared source: Production
-- uploads once, and that same data is used for both receiving AND
-- label printing.
--
-- Run this AFTER migration_002, migration_003, and migration_004.
--
-- The old pallet_labels/pallet_label_batches/pallet_label_staging
-- tables and their functions are left in place (not dropped) so any
-- data already in them isn't lost — they're just no longer written to
-- or read from by the app going forward.
-- =====================================================================

-- ---------------------------------------------------------------------
-- transfer_import_staging: add the 3 extra columns Production's Excel
-- can now optionally include, for label printing.
-- ---------------------------------------------------------------------
alter table public.transfer_import_staging
  add column if not exists destination_warehouse text,
  add column if not exists production_date_raw text,
  add column if not exists production_date date,
  add column if not exists pallet_number text;

-- ---------------------------------------------------------------------
-- transfer_master: add the fields needed to print a label, plus print
-- tracking (previously lived on pallet_labels).
-- ---------------------------------------------------------------------
alter table public.transfer_master
  add column if not exists production_date date,
  add column if not exists pallet_number text,
  add column if not exists print_count integer not null default 0,
  add column if not exists last_printed_at timestamptz,
  add column if not exists last_printed_by uuid references public.users(id);
-- (destination_warehouse already exists as of migration_004)

-- ---------------------------------------------------------------------
-- Re-point label_print_history at transfer_master instead of
-- pallet_labels. The old pallet_label_id column is left in place
-- (nullable, unused going forward) so any existing print history rows
-- aren't orphaned.
-- ---------------------------------------------------------------------
alter table public.label_print_history
  add column if not exists transfer_master_id uuid references public.transfer_master(id) on delete set null;

-- ---------------------------------------------------------------------
-- Updated import validation: now also passes through the 3 new
-- optional columns. They are NOT required — a row missing them still
-- imports fine for receiving purposes, it just can't be printed as a
-- label until Production re-uploads it with that info (the app
-- disables the Print action for such rows, with a clear reason shown).
-- ---------------------------------------------------------------------
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

  update public.transfer_import_staging s
  set transferred_quantity = case
        when s.transferred_quantity_raw ~ '^[0-9]+(\.[0-9]+)?$' and s.transferred_quantity_raw::numeric > 0
          then s.transferred_quantity_raw::numeric
        else null
      end,
      production_date = public.safe_to_date(s.production_date_raw)
  where s.import_batch_id = p_batch_id and s.validation_status is null;

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
          then 'Transfer Barcode already exists in database' end,
        case when coalesce(trim(s.production_date_raw), '') <> '' and s.production_date is null
          then 'Invalid Production Date' end
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

  insert into public.transfer_master
    (transfer_barcode, item_code, description, uom, transferred_quantity, status, import_batch_id,
     destination_warehouse, production_date, pallet_number)
  select s.transfer_barcode, s.item_code, s.description, s.uom, s.transferred_quantity, 'Pending', p_batch_id,
         nullif(trim(s.destination_warehouse), ''), s.production_date, nullif(trim(s.pallet_number), '')
  from public.transfer_import_staging s
  where s.import_batch_id = p_batch_id and s.validation_status = 'valid';

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

-- ---------------------------------------------------------------------
-- record_label_print: now logs against transfer_master instead of
-- pallet_labels, and updates the print tracking columns there.
-- ---------------------------------------------------------------------
create or replace function public.record_label_print(
  p_transfer_barcode text,
  p_printer_name text default null,
  p_is_reprint boolean default false
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_label_printer_user() then
    raise exception 'Only Production, Warehouse Officer, or Admin users can print labels.';
  end if;

  select id into v_id from public.transfer_master where transfer_barcode = p_transfer_barcode;
  if v_id is null then
    raise exception 'Unknown Transfer Barcode: %', p_transfer_barcode;
  end if;

  insert into public.label_print_history (transfer_master_id, transfer_barcode, printed_by, printer_name, is_reprint)
  values (v_id, p_transfer_barcode, auth.uid(), p_printer_name, p_is_reprint);

  update public.transfer_master
  set print_count = print_count + 1,
      last_printed_at = now(),
      last_printed_by = auth.uid()
  where id = v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS: Production (in addition to Officer/Admin, already allowed) can
-- now also read transfer_master directly, so they can browse and print
-- from the records they uploaded. This does not change what Receivers
-- can see — they still have zero SELECT policy on this table.
-- ---------------------------------------------------------------------
drop policy if exists transfer_master_select on public.transfer_master;
create policy transfer_master_select on public.transfer_master
  for select using (public.is_officer() or public.is_production_user());
