-- =====================================================================
-- WITS — optional seed data
-- Run after schema.sql. Safe to skip in production.
-- =====================================================================

-- Sample products so you can test scanning immediately.
insert into public.products (barcode, item_code, description, uom)
values
  ('4800000000017', 'FG-1001', 'Canned Sardines 155g', 'CTN'),
  ('4800000000024', 'FG-1002', 'Instant Noodles 60g', 'CTN'),
  ('4800000000031', 'FG-1003', 'Bottled Water 500ml', 'CASE'),
  ('4800000000048', 'FG-1004', 'Cooking Oil 1L', 'CASE'),
  ('4800000000055', 'FG-1005', 'All-Purpose Flour 1kg', 'BAG'),
  ('4800000000062', 'FG-1006', 'White Sugar 1kg', 'BAG'),
  ('4800000000079', 'FG-1007', 'Powdered Milk 320g', 'CTN'),
  ('4800000000086', 'FG-1008', 'Soy Sauce 1L', 'CASE')
on conflict (barcode) do nothing;

-- ---------------------------------------------------------------------
-- Creating the first Administrator
-- ---------------------------------------------------------------------
-- public.users rows are created automatically by a trigger when a new
-- auth.users row is inserted (see schema.sql: handle_new_auth_user).
-- The anon/client key cannot create auth users directly, so create the
-- first account from the Supabase Dashboard:
--
--   1. Authentication > Users > Add user > Create new user
--      - Email: admin@yourcompany.com
--      - Password: (set a temporary password)
--      - User Metadata (raw_user_meta_data), as JSON:
--          { "full_name": "Warehouse Admin", "role": "admin" }
--
--   2. The trigger inserts a matching row into public.users with
--      role = 'admin' automatically. Confirm with:
--
--      select id, full_name, email, role from public.users;
--
-- Every subsequent user (warehouse staff or additional admins) can then
-- be created the same way from the dashboard, or by an admin through
-- the in-app Users page (which calls the Supabase Admin API via a
-- server-side function — see README "Creating users" section).
