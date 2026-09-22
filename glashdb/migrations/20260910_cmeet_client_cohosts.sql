-- Identify client-created cMeet rooms so their creator can join as a co-host
-- and manage the waiting room. Team creators already use `created_by`; this
-- companion reference gives client-dashboard creators the same durable role.

begin;

alter table public.team_meetings
  add column if not exists created_by_client uuid
    references public.profiles(id) on delete set null;

create index if not exists team_meetings_created_by_client_idx
  on public.team_meetings (created_by_client)
  where created_by_client is not null;

comment on column public.team_meetings.created_by_client is
  'Client account that created this room. The account is a cMeet co-host and may manage lobby admission.';

commit;
