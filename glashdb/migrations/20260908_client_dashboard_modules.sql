-- Every client saw every section of the client dashboard, whether or not we had
-- anything to put in it. A client who never orders merch still had a Merch tab,
-- and turning one off meant editing the sidebar for everyone.
--
-- Two tables now answer "should this client see this section". The defaults
-- table is the platform-wide answer; the overrides table is one client saying
-- something different. A module with no row anywhere is on, so nothing changes
-- until someone deliberately turns a section off.

begin;

create table if not exists public.client_dashboard_modules (
  module_key text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.client_dashboard_modules is
  'Platform-wide default visibility for each client dashboard module.';
comment on column public.client_dashboard_modules.module_key is
  'Module key from src/lib/client-modules.ts.';

create table if not exists public.client_dashboard_module_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  module_key text not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (user_id, module_key)
);

comment on table public.client_dashboard_module_overrides is
  'Per-client visibility that wins over the platform default for one module.';

create index if not exists client_dashboard_module_overrides_user_idx
  on public.client_dashboard_module_overrides (user_id);

commit;
