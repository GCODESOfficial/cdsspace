-- Client-owned brand identity briefs and private asset library.
-- The authenticated profile UUID is the ownership boundary. Public brief links
-- continue to use public_token through the server-only API.

create extension if not exists "pgcrypto";

alter table public.brand_briefs
  add column if not exists client_user_id uuid references public.profiles(id) on delete set null;

update public.brand_briefs brief
set client_user_id = profile.id
from public.profiles profile
where brief.client_user_id is null
  and brief.contact_email is not null
  and lower(brief.contact_email) = lower(profile.email);

create index if not exists idx_brand_briefs_client_updated
  on public.brand_briefs(client_user_id, updated_at desc)
  where client_user_id is not null;

create table if not exists public.client_brand_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  brief_id uuid references public.brand_briefs(id) on delete set null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint not null default 0,
  file_kind text not null default 'document'
    check (file_kind in ('image', 'pdf', 'office', 'archive', 'document')),
  created_at timestamptz not null default now()
);

create index if not exists idx_client_brand_assets_user_created
  on public.client_brand_assets(user_id, created_at desc);

alter table public.brand_briefs enable row level security;
drop policy if exists brand_briefs_all on public.brand_briefs;
drop policy if exists "Clients can read own brand briefs" on public.brand_briefs;
create policy "Clients can read own brand briefs"
  on public.brand_briefs for select to authenticated
  using (client_user_id = auth.uid());
drop policy if exists "Clients can create own brand briefs" on public.brand_briefs;
create policy "Clients can create own brand briefs"
  on public.brand_briefs for insert to authenticated
  with check (client_user_id = auth.uid());
drop policy if exists "Clients can update own brand briefs" on public.brand_briefs;
create policy "Clients can update own brand briefs"
  on public.brand_briefs for update to authenticated
  using (client_user_id = auth.uid())
  with check (client_user_id = auth.uid());

alter table public.client_brand_assets enable row level security;
drop policy if exists "Clients can read own brand assets" on public.client_brand_assets;
create policy "Clients can read own brand assets"
  on public.client_brand_assets for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "Clients can add own brand assets" on public.client_brand_assets;
create policy "Clients can add own brand assets"
  on public.client_brand_assets for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "Clients can remove own brand assets" on public.client_brand_assets;
create policy "Clients can remove own brand assets"
  on public.client_brand_assets for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update on public.brand_briefs to authenticated;
grant select, insert, delete on public.client_brand_assets to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('client-brand-assets', 'client-brand-assets', false, 26214400, null)
    on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        updated_at = now();
  end if;
end $$;
