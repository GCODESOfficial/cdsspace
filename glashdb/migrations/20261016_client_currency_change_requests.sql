-- Billing currency change requests: a client's billing currency is chosen once
-- during account setup and can't be edited afterwards. A client who chose the
-- wrong one asks for a change here (with a reason); an admin approves it, which
-- switches profiles.billing_currency, or declines it. One pending request per
-- client at a time.

begin;

create table if not exists public.client_currency_change_requests (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.profiles(id) on delete cascade,
  current_currency text not null,
  requested_currency text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text
);

create unique index if not exists idx_client_currency_change_requests_one_pending
  on public.client_currency_change_requests(client_user_id)
  where status = 'pending';

create index if not exists idx_client_currency_change_requests_admin_queue
  on public.client_currency_change_requests(status, requested_at desc);

create index if not exists idx_client_currency_change_requests_client
  on public.client_currency_change_requests(client_user_id, requested_at desc);

alter table public.client_currency_change_requests enable row level security;
revoke all on public.client_currency_change_requests from anon, authenticated;

commit;
