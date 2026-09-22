-- Client email verification, owned by CDS Space.
--
-- GlashDB exposes no way for the app to verify an account: its admin
-- generate_link, verify, resend and recover endpoints do not exist, and admin
-- user updates are refused. New sign-ups therefore sat unconfirmed with no
-- email that could unlock them. Accounts are now confirmed by GlashDB on
-- creation, and CDS Space proves ownership of the address itself: a single-use
-- token is emailed in the branded template, and only following it sets
-- profiles.email_verified_at, which is what the client dashboard requires.

begin;

create table if not exists public.client_email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  -- SHA-256 of a 32-byte random token. The token itself is only ever in the email.
  token_hash text not null unique,
  next_path text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.client_email_verifications is
  'Single-use client email verification tokens. Only the SHA-256 hash is stored.';

create index if not exists client_email_verifications_user_idx
  on public.client_email_verifications (user_id, created_at desc);
create index if not exists client_email_verifications_expiry_idx
  on public.client_email_verifications (expires_at)
  where used_at is null;

-- Server-side only: the service role reads and writes it. No client access.
alter table public.client_email_verifications enable row level security;

commit;
