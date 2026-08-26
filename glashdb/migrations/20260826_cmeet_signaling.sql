-- First-party CMeet signaling.
--
-- Replaces the GlashDB realtime broadcast channel, which CMeet was the only
-- consumer of and which never delivered a message between two clients. Peers
-- now exchange offers, answers and ICE candidates through this table: writers
-- insert, readers stream rows newer than their cursor over SSE.
--
-- A table rather than an in-memory hub so signaling survives more than one
-- server instance. Rows are worthless seconds after they are written, so they
-- are swept aggressively.

begin;

create table if not exists public.cmeet_signals (
  id bigserial primary key,
  room_code text not null,
  from_peer text not null,
  -- null addresses the whole room (a join announcement); otherwise one peer.
  to_peer text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- The read path is always "this room, newer than my cursor", in id order.
create index if not exists cmeet_signals_room_idx
  on public.cmeet_signals (room_code, id);

create index if not exists cmeet_signals_created_idx
  on public.cmeet_signals (created_at);

comment on table public.cmeet_signals is
  'Short-lived WebRTC signaling envelopes for CMeet. Swept after two minutes.';

commit;
