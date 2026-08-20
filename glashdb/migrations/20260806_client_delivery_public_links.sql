-- Stable, revocable public links for completed client deliveries.
-- Public pages are served by token-aware server routes; private object URLs
-- are never stored or exposed as permanent public links.

create extension if not exists "pgcrypto";

alter table public.client_deliveries
  add column if not exists public_token uuid,
  add column if not exists public_access_revoked_at timestamptz;

update public.client_deliveries
   set public_token = gen_random_uuid()
 where public_token is null;

alter table public.client_deliveries
  alter column public_token set default gen_random_uuid(),
  alter column public_token set not null;

create unique index if not exists idx_client_deliveries_public_token
  on public.client_deliveries(public_token);

comment on column public.client_deliveries.public_token is
  'Unpredictable token used by the server-rendered public delivery handover page.';
comment on column public.client_deliveries.public_access_revoked_at is
  'When populated, immediately disables the public delivery page and file links.';
