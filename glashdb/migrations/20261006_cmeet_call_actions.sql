-- What an admin did about an incoming client call.
--
-- A client call rang every admin at once and offered one choice: join it.
-- Anyone who could not take it had no way to hand it to a colleague or offer
-- another time, and the client was left listening to a ringtone with nothing
-- to tell them. Each decision is now recorded here, which also stops the call
-- ringing for the admin who has already dealt with it.

begin;

create table if not exists public.cmeet_call_actions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.team_meetings(id) on delete cascade,
  -- The admin who acted. Admin identities are emails or member ids depending
  -- on how they signed in, so this is text rather than a foreign key.
  actor_key text not null,
  actor_name text,
  action text not null check (action in ('redirected', 'rescheduled', 'unavailable')),
  target_member_id uuid references public.team_members(id) on delete set null,
  target_label text,
  scheduled_for timestamptz,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.cmeet_call_actions is
  'Redirects, reschedules and no-answer outcomes for incoming client calls.';

-- The ringer asks this on every poll: has this admin already dealt with it?
create index if not exists cmeet_call_actions_meeting_actor_idx
  on public.cmeet_call_actions (meeting_id, actor_key);
create index if not exists cmeet_call_actions_target_idx
  on public.cmeet_call_actions (target_member_id, created_at desc)
  where target_member_id is not null;

alter table public.cmeet_call_actions enable row level security;
revoke all on public.cmeet_call_actions from anon, authenticated;

commit;
