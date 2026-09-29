create extension if not exists pgcrypto;

create table if not exists public.create_saved_signatures (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('client', 'team', 'admin')),
  owner_id text not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  storage_path text not null,
  storage_name text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_create_saved_signatures_owner_name
  on public.create_saved_signatures (owner_kind, owner_id, lower(name))
  where deleted_at is null;

create index if not exists idx_create_saved_signatures_owner
  on public.create_saved_signatures (owner_kind, owner_id, updated_at desc)
  where deleted_at is null;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'touch_create_updated_at') then
    drop trigger if exists touch_create_saved_signatures_updated_at on public.create_saved_signatures;
    create trigger touch_create_saved_signatures_updated_at
      before update on public.create_saved_signatures
      for each row execute function public.touch_create_updated_at();
  end if;
end
$$;

alter table public.create_saved_signatures enable row level security;
revoke all on public.create_saved_signatures from anon, authenticated;

comment on table public.create_saved_signatures is
  'Private, named Create Studio signature assets reusable only by their owning workspace.';
