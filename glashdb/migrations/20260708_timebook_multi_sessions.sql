-- Allow up to 3 check-in/check-out cycles per day. The single
-- team_time_entries row per (member, work_date) stays; completed cycles are
-- accumulated in `sessions` and the row's clock_in_at keeps the FIRST
-- check-in (attendance status is judged on it) while clock_out_at holds the
-- latest checkout (null while currently checked in).
alter table public.team_time_entries
  -- Completed sessions: [{ clock_in_at, clock_out_at, minutes }]
  add column if not exists sessions jsonb not null default '[]'::jsonb,
  -- Start of the CURRENT open session (equals clock_in_at for the first one).
  add column if not exists session_started_at timestamptz;
