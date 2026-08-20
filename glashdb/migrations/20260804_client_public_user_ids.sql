-- Public-facing client account IDs are short route identifiers. Internal UUIDs
-- remain the ownership and foreign-key source of truth for every private row.

create extension if not exists "pgcrypto";

alter table public.profiles
  add column if not exists public_user_id text;

create or replace function public.generate_client_public_user_id()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.profiles profile where profile.public_user_id = candidate
    );
  end loop;
  return candidate;
end;
$$;

do $$
declare
  profile_row record;
  candidate text;
begin
  for profile_row in
    select id from public.profiles where public_user_id is null order by id
  loop
    candidate := upper(substr(replace(profile_row.id::text, '-', ''), 1, 8));
    if exists (select 1 from public.profiles where public_user_id = candidate) then
      candidate := public.generate_client_public_user_id();
    end if;
    update public.profiles set public_user_id = candidate where id = profile_row.id;
  end loop;
end $$;

alter table public.profiles
  alter column public_user_id set default public.generate_client_public_user_id(),
  alter column public_user_id set not null;

alter table public.profiles
  drop constraint if exists profiles_public_user_id_format_check;

alter table public.profiles
  add constraint profiles_public_user_id_format_check
  check (public_user_id ~ '^[A-Z0-9]{8}$');

create unique index if not exists profiles_public_user_id_uidx
  on public.profiles(public_user_id);

comment on column public.profiles.public_user_id is
  'Eight-character public account ID used in client dashboard URLs. The profile UUID remains the internal ownership key.';
