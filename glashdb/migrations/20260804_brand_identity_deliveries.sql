-- Final brand-identity deliveries shared from a completed CDS Space project.
-- Files stay in a private bucket. Account holders and unguessable public-share
-- links receive short-lived signed URLs from server routes.

create extension if not exists "pgcrypto";

create table if not exists public.brand_identity_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.finance_projects(id) on delete cascade,
  brief_id uuid references public.brand_briefs(id) on delete set null,
  title text not null,
  description text,
  -- Build the 48-character public token from PostgreSQL's cryptographically
  -- random UUID generator. Unlike pgcrypto.gen_random_bytes(),
  -- gen_random_uuid() is available without depending on whether pgcrypto was
  -- installed into the public or extensions schema.
  public_token text not null unique default (
    replace(gen_random_uuid()::text, '-', '')
    || left(replace(gen_random_uuid()::text, '-', ''), 16)
  ),
  is_public boolean not null default false,
  published_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_identity_deliveries_one_per_project unique (project_id)
);

create table if not exists public.brand_identity_delivery_files (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.brand_identity_deliveries(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint not null default 0,
  file_kind text not null default 'document'
    check (file_kind in ('image', 'pdf', 'office', 'archive', 'document')),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_brand_identity_deliveries_user_published
  on public.brand_identity_deliveries(user_id, published_at desc);
create index if not exists idx_brand_identity_delivery_files_delivery
  on public.brand_identity_delivery_files(delivery_id, position, created_at);

alter table public.brand_identity_deliveries enable row level security;
drop policy if exists "Clients can read own published brand identities" on public.brand_identity_deliveries;
create policy "Clients can read own published brand identities"
  on public.brand_identity_deliveries for select to authenticated
  using (user_id = auth.uid() and is_public = true and published_at is not null);

alter table public.brand_identity_delivery_files enable row level security;
drop policy if exists "Clients can read files in own published brand identities" on public.brand_identity_delivery_files;
create policy "Clients can read files in own published brand identities"
  on public.brand_identity_delivery_files for select to authenticated
  using (
    exists (
      select 1
      from public.brand_identity_deliveries delivery
      where delivery.id = delivery_id
        and delivery.user_id = auth.uid()
        and delivery.is_public = true
        and delivery.published_at is not null
    )
  );

grant select on public.brand_identity_deliveries, public.brand_identity_delivery_files to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('brand-identity-deliveries', 'brand-identity-deliveries', false, 52428800, null)
    on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        updated_at = now();
  end if;
end $$;
