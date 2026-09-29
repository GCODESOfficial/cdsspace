-- One-time codes between the mobile app and the website.
--
-- app_signin:  Google/LinkedIn sign-in runs in a browser; when it finishes, the
--              server hands the app a code (via its cdsspace:// link) that the
--              app exchanges for its device session. Never a session itself.
-- web_session: the app opens a web page that needs a signed-in browser (cMeet
--              rooms, private reports, connecting a sign-in account). The code
--              signs that browser in once and then redirects to the page.
--
-- Codes are random, stored only as a SHA-256 hash, single-use and expire within
-- minutes.

begin;

create table if not exists public.client_mobile_handoffs (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('app_signin', 'web_session')),
  code_hash text not null unique,
  user_id uuid not null,
  email text not null default '',
  target_path text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

comment on table public.client_mobile_handoffs is
  'Single-use, short-lived codes linking the mobile app and a browser for one client.';

create index if not exists client_mobile_handoffs_expiry_idx
  on public.client_mobile_handoffs (expires_at);

alter table public.client_mobile_handoffs enable row level security;
revoke all on public.client_mobile_handoffs from anon, authenticated;

commit;
