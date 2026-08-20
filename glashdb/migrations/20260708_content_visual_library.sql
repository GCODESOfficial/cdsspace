-- Content Hub Visual Library
-- Photos and videos prepared by designers / videographers before content
-- creators pick them for image/video generation.
-- Idempotent; apply manually in the GlashDB SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.content_visual_assets (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  kind text not null
    check (kind in ('image','video')),
  file_name text,
  mime_type text,
  size_bytes bigint,
  thumbnail_url text,
  title text,
  notes text,
  tags text[] not null default '{}',
  status text not null default 'available'
    check (status in ('available','used','archived')),
  used_at timestamptz,
  archived_at timestamptz,
  used_in_content_id uuid references public.content_items(id) on delete set null,
  created_by text,
  created_by_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_visual_assets_kind_idx on public.content_visual_assets(kind);
create index if not exists content_visual_assets_status_idx on public.content_visual_assets(status);
create index if not exists content_visual_assets_created_idx on public.content_visual_assets(created_at desc);
create index if not exists content_visual_assets_used_content_idx on public.content_visual_assets(used_in_content_id);
create index if not exists content_visual_assets_tags_idx on public.content_visual_assets using gin(tags);

grant select, insert, update, delete on public.content_visual_assets to anon, authenticated, service_role;

alter table public.content_visual_assets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'content_visual_assets'
      and policyname = 'content_visual_assets_all'
  ) then
    create policy content_visual_assets_all
    on public.content_visual_assets
    for all
    to anon, authenticated, service_role
    using (true)
    with check (true);
  end if;
end $$;
