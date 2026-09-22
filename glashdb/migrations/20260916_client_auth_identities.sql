create extension if not exists pgcrypto;

create table if not exists public.client_auth_identities (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'linkedin')),
  provider_subject text not null,
  provider_email text,
  provider_email_verified boolean not null default false,
  connected_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subject),
  unique (client_user_id, provider)
);

create index if not exists idx_client_auth_identities_client
  on public.client_auth_identities(client_user_id, provider);

drop trigger if exists touch_client_auth_identities_updated_at on public.client_auth_identities;
create trigger touch_client_auth_identities_updated_at
before update on public.client_auth_identities
for each row execute function public.touch_create_updated_at();

-- Existing native Google identities remain attached to their current client
-- profile. Future explicit linking can safely move a provider identity only
-- after the user proves both the active CDS Space session and provider login.
insert into public.client_auth_identities
  (client_user_id, provider, provider_subject, provider_email, provider_email_verified, connected_at, last_used_at)
select
  identity.user_id,
  'google',
  identity.provider_id,
  coalesce(nullif(identity.email, ''), nullif(identity.identity_data ->> 'email', '')),
  case
    when lower(identity.identity_data ->> 'email_verified') = 'false' then false
    else true
  end,
  identity.created_at,
  coalesce(identity.last_sign_in_at, identity.created_at)
from auth.identities identity
join public.profiles profile on profile.id = identity.user_id
where identity.provider = 'google'
  and nullif(identity.provider_id, '') is not null
on conflict do nothing;

-- Direct LinkedIn sign-in stores the verified LinkedIn subject in auth user
-- metadata when GlashDB creates a new auth user.
insert into public.client_auth_identities
  (client_user_id, provider, provider_subject, provider_email, provider_email_verified, connected_at, last_used_at)
select
  auth_user.id,
  'linkedin',
  auth_user.raw_user_meta_data ->> 'linkedin_sub',
  auth_user.email,
  true,
  auth_user.created_at,
  coalesce(auth_user.last_sign_in_at, auth_user.created_at)
from auth.users auth_user
join public.profiles profile on profile.id = auth_user.id
where nullif(auth_user.raw_user_meta_data ->> 'linkedin_sub', '') is not null
on conflict do nothing;

alter table public.client_auth_identities enable row level security;
