-- Phones that can be rung for cMeet calls while the app is closed.
--
-- The app only noticed an incoming call while it was open (it asked the server
-- every few seconds). Each signed-in portal on a phone now registers how to
-- wake it: an Expo push token on Android (a data message that shows the
-- full-screen call notification) and a PushKit VoIP token on iPhone (which
-- shows the native CallKit call screen).

begin;

create table if not exists public.mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  -- Who this phone rings for: 'client:<user id>', 'team:<member id>' or
  -- 'admin:<member id or email>'. One phone may hold several portals.
  subject_key text not null,
  portal text not null check (portal in ('client', 'team', 'admin')),
  platform text not null check (platform in ('android', 'ios')),
  -- 'expo' (Android, through the Expo push service) or 'voip' (iPhone, APNs PushKit).
  token_kind text not null check (token_kind in ('expo', 'voip')),
  token text not null,
  -- Admins only take client calls with the Messages permission (as the web ringer).
  takes_client_calls boolean not null default false,
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token, portal)
);

comment on table public.mobile_push_devices is
  'Push tokens that ring a signed-in phone for incoming cMeet calls.';

create index if not exists mobile_push_devices_subject_idx on public.mobile_push_devices (subject_key);
create index if not exists mobile_push_devices_admin_idx
  on public.mobile_push_devices (portal) where portal = 'admin' and takes_client_calls;

alter table public.mobile_push_devices enable row level security;
revoke all on public.mobile_push_devices from anon, authenticated;

commit;
