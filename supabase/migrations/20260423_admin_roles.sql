-- ============================================
-- CDS Space: Admin Roles — reusable permission bundles
-- Idempotent. Run in Supabase SQL editor.
-- ============================================

create extension if not exists "pgcrypto";

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_roles_name on public.admin_roles(name);

alter table public.admin_roles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'admin_roles' and policyname = 'admin_roles_all') then
    create policy admin_roles_all on public.admin_roles for all using (true) with check (true);
  end if;
end $$;

create or replace function public.touch_admin_roles_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_admin_roles_touch on public.admin_roles;
create trigger trg_admin_roles_touch
  before update on public.admin_roles
  for each row execute function public.touch_admin_roles_updated_at();

-- Link sub-admins (and team members acting as sub-admins) to a role.
-- The role.permissions array is treated as the authoritative grant set —
-- the sub-admin's own `permissions` column stays as an override layer.
alter table public.sub_admins        add column if not exists role_id uuid references public.admin_roles(id) on delete set null;
alter table public.team_members      add column if not exists role_id uuid references public.admin_roles(id) on delete set null;

-- Seed a couple of starter roles so the UI isn't empty on first load.
insert into public.admin_roles (name, description, permissions)
values
  ('Viewer',       'Read-only across dashboard, finance, orders & consultations.',
    array['dashboard.view','finance.view','orders.view','consultations.view','messages.view']),
  ('Finance Manager','Full finance + project control.',
    array['finance.view','finance.manage','orders.view','orders.update_status']),
  ('Client Success','Handle consultations, orders, and client conversations.',
    array['consultations.view','consultations.manage','orders.view','orders.update_status','messages.view','messages.send'])
on conflict (name) do nothing;
