create extension if not exists pgcrypto;

create table if not exists public.create_letterheads (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('client', 'team', 'admin')),
  owner_id text not null,
  actor_email text,
  title text not null default 'Untitled letter',
  body_html text not null default '',
  paper_size text not null default 'a4' check (paper_size in ('a4', 'legal')),
  has_second_page boolean not null default false,
  first_page_path text,
  first_page_name text,
  second_page_path text,
  second_page_name text,
  signature_path text,
  signature_name text,
  signature_x numeric(6,3) not null default 62.000 check (signature_x between 0 and 100),
  signature_y numeric(6,3) not null default 74.000 check (signature_y between 0 and 100),
  signature_width numeric(6,3) not null default 24.000 check (signature_width between 5 and 80),
  signature_page text not null default 'last' check (signature_page in ('first', 'last')),
  status text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  last_exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_create_letterheads_owner
  on public.create_letterheads(owner_kind, owner_id, deleted_at, updated_at desc);

drop trigger if exists touch_create_letterheads_updated_at on public.create_letterheads;
create trigger touch_create_letterheads_updated_at
before update on public.create_letterheads
for each row execute function public.touch_create_updated_at();

insert into public.create_tools
  (slug, name, short_description, category, stage, status, role_access, credit_cost,
   requires_provider, provider_key, is_beta, is_new, is_featured,
   supports_simple_mode, supports_pro_mode, output_formats)
values
  ('official-letterhead', 'Create an official letterhead',
   'Write, refine, sign, duplicate, and export private corporate letterhead documents as PDF.',
   'Documents', 'phase_2', 'active', array['client','team','admin']::text[], 0,
   false, null, false, true, true, true, true, array['PDF']::text[])
on conflict (slug) do update set
  name = excluded.name,
  short_description = excluded.short_description,
  category = excluded.category,
  stage = excluded.stage,
  status = excluded.status,
  role_access = excluded.role_access,
  credit_cost = excluded.credit_cost,
  requires_provider = excluded.requires_provider,
  provider_key = excluded.provider_key,
  is_beta = excluded.is_beta,
  is_new = excluded.is_new,
  is_featured = excluded.is_featured,
  supports_simple_mode = excluded.supports_simple_mode,
  supports_pro_mode = excluded.supports_pro_mode,
  output_formats = excluded.output_formats,
  updated_at = now();

insert into storage.buckets (id, name, public)
values ('create-private-assets', 'create-private-assets', false)
on conflict (id) do update set public = false;
