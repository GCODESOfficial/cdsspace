-- Chunked tutorial uploads move off the server's local disk.
--
-- Parts were held in /tmp until the video was whole, but that disk is 64MB on
-- production, so any real tutorial failed part way with "no space left on
-- device". Parts now go straight to the private tutorial bucket and this table
-- tracks the upload, which also means a resumed upload finds its parts even if
-- a different server instance answers.

begin;

create table if not exists public.tutorial_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  file_name text not null,
  file_size bigint not null,
  content_type text not null default 'video/mp4',
  chunk_size integer not null,
  total_parts integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tutorial_upload_sessions is
  'In-progress chunked tutorial uploads. Parts live in the tutorial bucket under uploads/<id>/.';

create index if not exists tutorial_upload_sessions_owner_idx
  on public.tutorial_upload_sessions (owner, created_at desc);

alter table public.tutorial_upload_sessions enable row level security;
revoke all on public.tutorial_upload_sessions from anon, authenticated;

commit;
