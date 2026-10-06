-- Archiving conversations, by the super admin only.
--
-- An archived conversation is hidden from the other admins: they can no
-- longer see, open or answer it. The people in it (the client, or the team
-- members of a team chat) carry on as usual, and so does the super admin, who
-- finds it under Archived and can restore it. Team chat threads carry the flag themselves;
-- a client's direct conversation (chat_messages room "client_<id>") has no row
-- of its own, so it is recorded here.

begin;

alter table public.team_chat_threads add column if not exists archived_at timestamptz;
alter table public.team_chat_threads add column if not exists archived_by text;

create table if not exists public.chat_room_archives (
  room_id text primary key,
  archived_at timestamptz not null default now(),
  archived_by text
);

comment on table public.chat_room_archives is
  'Client conversations the super admin has archived (hidden from the other admins).';

alter table public.chat_room_archives enable row level security;
revoke all on public.chat_room_archives from anon, authenticated;

commit;
