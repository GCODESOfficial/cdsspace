-- CMeet admission control.
--
-- Staff decide who gets into a room, with one deliberate exception: the client
-- the meeting was booked for walks straight in. Making a client sit in a lobby
-- for a consultation we invited them to is the wrong default, so the room now
-- records who it is for and hands that person a token in their link.

begin;

alter table public.team_meetings
  -- The client this room was created for. They bypass the lobby.
  add column if not exists guest_email text,
  -- Unguessable proof of invitation, embedded in the link we send them, so an
  -- invited client needs no account to skip the lobby.
  add column if not exists guest_token text;

create unique index if not exists team_meetings_guest_token_idx
  on public.team_meetings (guest_token)
  where guest_token is not null;

create table if not exists public.cmeet_join_requests (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  peer_id text not null,
  name text not null,
  email text,
  status text not null default 'waiting'
    check (status in ('waiting', 'admitted', 'denied')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

-- One live request per peer, so a refresh replaces rather than stacks.
create unique index if not exists cmeet_join_requests_peer_idx
  on public.cmeet_join_requests (room_code, peer_id);

-- The host panel reads "everyone still waiting in this room".
create index if not exists cmeet_join_requests_room_idx
  on public.cmeet_join_requests (room_code, status, requested_at);

comment on table public.cmeet_join_requests is
  'CMeet lobby. Staff admit or deny; the invited client never appears here.';
comment on column public.team_meetings.guest_token is
  'Secret in the invited client link. Presenting it skips the lobby.';

commit;
