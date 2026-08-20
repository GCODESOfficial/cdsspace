begin;

create table if not exists public.banner_edit_requests (
  id uuid primary key default gen_random_uuid(),
  banner_request_id uuid not null references public.banner_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  status text not null default 'submitted'
    check (status in ('submitted', 'in_review', 'resolved', 'declined')),
  admin_note text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

create unique index if not exists banner_edit_requests_one_open_per_banner
  on public.banner_edit_requests (banner_request_id)
  where status in ('submitted', 'in_review');

create index if not exists banner_edit_requests_user_requested_idx
  on public.banner_edit_requests (user_id, requested_at desc);

create index if not exists banner_edit_requests_status_requested_idx
  on public.banner_edit_requests (status, requested_at desc);

alter table public.banner_edit_requests enable row level security;
revoke all on public.banner_edit_requests from anon, authenticated;

commit;
