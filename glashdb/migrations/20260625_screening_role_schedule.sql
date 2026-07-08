-- CDS Space: Per-role screening appointment
-- ---------------------------------------------------------------------------
-- Admins set ONE screening appointment (date/time, location, what to bring,
-- notes) for a whole role on the screening dashboard. It is the source of
-- truth for the role and is copied onto every candidate's screening_candidates
-- row, so the objective test still unlocks off each candidate's scheduled_at.
-- Candidates shortlisted later inherit it automatically.
--
-- Migrations here are MANUAL (no runner) - apply this SQL by hand against
-- GlashDB. Everything is idempotent (IF NOT EXISTS).
-- ---------------------------------------------------------------------------

create table if not exists public.screening_role_schedule (
  role_id      uuid primary key references public.open_roles(id) on delete cascade,
  scheduled_at timestamptz,                         -- screening date + time
  location     text,                                -- where it happens
  bring_items  text,                                -- "what to come with"
  instructions text,                                -- extra notes from admin
  updated_at   timestamptz not null default now()
);

-- Reuse the screening updated_at trigger from the screening_system migration.
drop trigger if exists screening_role_schedule_touch on public.screening_role_schedule;
create trigger screening_role_schedule_touch
  before update on public.screening_role_schedule
  for each row execute function public.screening_touch_updated_at();
