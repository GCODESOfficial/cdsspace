-- Admin resource version history.
--
-- Stores before/after snapshots for admin-side edits so permitted admins can
-- review who changed a record and restore a prior version when needed.
-- Re-runnable and intentionally generic: sections can share one table by
-- setting page/resource_type/resource_id.

create extension if not exists "pgcrypto";

create table if not exists public.admin_resource_versions (
  id uuid primary key default gen_random_uuid(),
  page text not null,
  resource_type text not null,
  resource_id text not null,
  resource_label text,
  action text not null,

  actor_kind text not null default 'system' check (actor_kind in ('admin','team','system')),
  actor_id text,
  actor_name text not null default 'System',
  actor_is_admin boolean not null default false,

  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_versions_resource_created
  on public.admin_resource_versions (resource_type, resource_id, created_at desc);

create index if not exists idx_admin_versions_page_created
  on public.admin_resource_versions (page, created_at desc);

create index if not exists idx_admin_versions_actor_created
  on public.admin_resource_versions (actor_id, created_at desc);

alter table public.admin_resource_versions enable row level security;

drop policy if exists allow_all_admin_resource_versions on public.admin_resource_versions;
create policy allow_all_admin_resource_versions
  on public.admin_resource_versions
  for all
  using (true)
  with check (true);

grant select, insert, update, delete on public.admin_resource_versions to anon, authenticated, service_role;

comment on table public.admin_resource_versions is
  'Before/after snapshots for admin records, used by section-level edit history and restore flows.';
