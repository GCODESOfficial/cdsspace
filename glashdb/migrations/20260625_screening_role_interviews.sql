-- CDS Space: Per-role interview schedule
-- ---------------------------------------------------------------------------
-- Admins set ONE interview date/time + venue for a whole role on the screening
-- dashboard. Every shortlisted candidate in that role sees it on their portal,
-- so the team schedules a role once instead of per candidate.
--
-- Migrations here are MANUAL (no runner) - apply this SQL by hand against
-- GlashDB. Everything is idempotent (IF NOT EXISTS).
-- ---------------------------------------------------------------------------

create table if not exists public.screening_role_interviews (
  role_id      uuid primary key references public.open_roles(id) on delete cascade,
  interview_at timestamptz,                         -- date + time of the interview
  venue        text,                                -- where it happens
  notes        text,                                -- optional extra instructions
  updated_at   timestamptz not null default now()
);

-- Reuse the screening updated_at trigger created in the screening_system
-- migration so the timestamp stays fresh on every change.
drop trigger if exists screening_role_interviews_touch on public.screening_role_interviews;
create trigger screening_role_interviews_touch
  before update on public.screening_role_interviews
  for each row execute function public.screening_touch_updated_at();
