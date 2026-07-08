-- CDS Space: cMeet auto-close support.
-- Tracks the last time any participant was present in a live meeting (via a
-- client heartbeat). A meeting with no presence for 30 minutes is auto-ended.

alter table public.team_meetings
  add column if not exists last_active_at timestamptz;

create index if not exists team_meetings_live_activity_idx
  on public.team_meetings (status, last_active_at)
  where status = 'live';
