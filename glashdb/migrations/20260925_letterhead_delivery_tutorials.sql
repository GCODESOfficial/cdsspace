create extension if not exists pgcrypto;

-- A delivered letter is a real client-owned CREATE document.  These fields
-- preserve its provenance without sharing the admin's private storage paths.
alter table public.create_letterheads
  add column if not exists delivered_by_cds boolean not null default false,
  add column if not exists delivered_from_letterhead_id uuid,
  add column if not exists delivered_by_admin text,
  add column if not exists delivered_at timestamptz;

create unique index if not exists uq_create_letterheads_active_delivery
  on public.create_letterheads(owner_kind, owner_id, delivered_from_letterhead_id)
  where delivered_from_letterhead_id is not null and deleted_at is null;

create table if not exists public.dashboard_tutorials (
  id uuid primary key default gen_random_uuid(),
  tool_slug text not null check (tool_slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  title text not null check (char_length(title) between 1 and 180),
  description text not null default '' check (char_length(description) <= 1200),
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_dashboard_tutorials_tool
  on public.dashboard_tutorials(tool_slug, status, sort_order, updated_at desc)
  where deleted_at is null;

create table if not exists public.dashboard_tutorial_media (
  id uuid primary key default gen_random_uuid(),
  tutorial_id uuid not null references public.dashboard_tutorials(id) on delete cascade,
  language_code text not null check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  language_name text not null check (char_length(language_name) between 1 and 80),
  video_path text not null,
  video_name text not null,
  video_mime text not null,
  video_size_bytes bigint not null check (video_size_bytes > 0),
  captions_path text,
  captions_name text,
  captions_size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tutorial_id, language_code)
);

create table if not exists public.client_tutorial_progress (
  client_user_id uuid not null references public.profiles(id) on delete cascade,
  tutorial_id uuid not null references public.dashboard_tutorials(id) on delete cascade,
  opened_at timestamptz,
  completed_at timestamptz,
  last_position_seconds numeric(12,3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (client_user_id, tutorial_id)
);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'touch_create_updated_at') then
    drop trigger if exists touch_dashboard_tutorials_updated_at on public.dashboard_tutorials;
    create trigger touch_dashboard_tutorials_updated_at
      before update on public.dashboard_tutorials
      for each row execute function public.touch_create_updated_at();

    drop trigger if exists touch_dashboard_tutorial_media_updated_at on public.dashboard_tutorial_media;
    create trigger touch_dashboard_tutorial_media_updated_at
      before update on public.dashboard_tutorial_media
      for each row execute function public.touch_create_updated_at();
  end if;
end
$$;

alter table public.dashboard_tutorials enable row level security;
alter table public.dashboard_tutorial_media enable row level security;
alter table public.client_tutorial_progress enable row level security;

do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on table public.dashboard_tutorials from %I', role_name);
      execute format('revoke all on table public.dashboard_tutorial_media from %I', role_name);
      execute format('revoke all on table public.client_tutorial_progress from %I', role_name);
    end if;
  end loop;
end
$$;

insert into storage.buckets (id, name, public)
values ('tutorial-private-assets', 'tutorial-private-assets', false)
on conflict (id) do update set public = false;
