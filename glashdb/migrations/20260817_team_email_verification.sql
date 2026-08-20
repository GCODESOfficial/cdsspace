-- Verified team email addresses and short-lived, hashed OTP challenges.
-- Existing members remain unverified until they prove access to their address.

alter table public.team_members
  add column if not exists email_verified_at timestamptz;

create table if not exists public.team_email_verifications (
  team_member_id uuid primary key references public.team_members(id) on delete cascade,
  pending_email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts between 0 and 5),
  resend_count integer not null default 1 check (resend_count > 0),
  rate_window_started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_email_verifications_pending_email_check
    check (pending_email = lower(btrim(pending_email)) and length(pending_email) between 3 and 320)
);

create unique index if not exists team_email_verifications_pending_email_unique
  on public.team_email_verifications (lower(pending_email));

create index if not exists team_email_verifications_expiry_idx
  on public.team_email_verifications (expires_at);

create or replace function public.touch_team_email_verification_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_team_email_verification_touch
  on public.team_email_verifications;
create trigger trg_team_email_verification_touch
  before update on public.team_email_verifications
  for each row execute function public.touch_team_email_verification_updated_at();

alter table public.team_email_verifications enable row level security;

comment on column public.team_members.email_verified_at is
  'When the member last proved access to their current email address.';
comment on table public.team_email_verifications is
  'One active email OTP challenge per team member. OTP values are stored only as HMAC hashes.';
