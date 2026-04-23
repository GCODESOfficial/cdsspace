-- ============================================
-- CDS Space: clients table — add address column
-- so invoice forms can auto-fill name + email + address
-- from the client directory.
-- ============================================

alter table public.clients
  add column if not exists address text;
