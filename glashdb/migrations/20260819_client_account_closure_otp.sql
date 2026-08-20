-- OTP gate for destructive client business-account closure.

create table if not exists public.client_account_closure_verifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  account_email text not null,
  closure_reason text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  resend_available_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  send_count integer not null default 1 check (send_count between 1 and 5),
  send_window_started_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_account_closure_verifications_expiry
  on public.client_account_closure_verifications (expires_at);

alter table public.client_account_closure_verifications enable row level security;

revoke all on public.client_account_closure_verifications from anon, authenticated;
