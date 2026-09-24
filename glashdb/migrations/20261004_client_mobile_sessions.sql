-- Signed-in devices for the CDS Space mobile app.
--
-- The web dashboard keeps its session in an HttpOnly cookie that page scripts
-- cannot read. A native app has no such cookie: it stores its session token
-- itself and sends it as "Authorization: Bearer <token>". A token held by an
-- app must be revocable, so unlike the stateless web cookie each mobile sign-in
-- is a row here. Only a SHA-256 hash of the token is stored; the raw token is
-- returned to the app once, at sign-in.

begin;

create table if not exists public.client_mobile_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null default '',
  token_hash text not null unique,
  platform text check (platform in ('ios', 'android', 'unknown')) default 'unknown',
  device_name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  -- Sliding expiry: extended while the app is in use, never past a hard cap.
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text
);

comment on table public.client_mobile_sessions is
  'Mobile app sign-ins for clients: one row per device, token stored as a hash, revocable.';

create index if not exists client_mobile_sessions_user_idx
  on public.client_mobile_sessions (user_id)
  where revoked_at is null;

-- Server-side only: the service role reads and writes it.
alter table public.client_mobile_sessions enable row level security;
revoke all on public.client_mobile_sessions from anon, authenticated;

commit;
