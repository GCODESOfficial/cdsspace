-- Persistent authentication abuse controls and short-lived client login OTPs.
-- Raw passwords, raw network addresses, browser fingerprints and plaintext OTPs
-- are deliberately never stored in these tables.

create table if not exists public.security_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.client_login_attempts (
  identity_hash text primary key,
  failed_count integer not null default 0 check (failed_count between 0 and 5),
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.client_login_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  otp_hash text not null,
  browser_binding_hash text not null,
  next_path text not null default '/dashboard',
  expires_at timestamptz not null,
  resend_available_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  send_count integer not null default 1 check (send_count between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_login_verifications_email_check
    check (email = lower(btrim(email)) and length(email) between 3 and 320),
  constraint client_login_verifications_next_path_check
    check (next_path like '/%' and next_path not like '//%')
);

create unique index if not exists client_login_verifications_user_unique
  on public.client_login_verifications (user_id);
create index if not exists client_login_verifications_expiry_idx
  on public.client_login_verifications (expires_at);
create index if not exists security_rate_limits_updated_idx
  on public.security_rate_limits (updated_at);
create index if not exists client_login_attempts_updated_idx
  on public.client_login_attempts (updated_at);

alter table public.security_rate_limits enable row level security;
alter table public.client_login_attempts enable row level security;
alter table public.client_login_verifications enable row level security;

comment on table public.security_rate_limits is
  'HMAC-keyed, server-only request throttles for abuse-sensitive operations.';
comment on table public.client_login_attempts is
  'HMAC-keyed failed password counters. Five failures require password recovery.';
comment on table public.client_login_verifications is
  'Bound, 15-minute client login OTP challenges. OTP values are HMAC hashes only.';

