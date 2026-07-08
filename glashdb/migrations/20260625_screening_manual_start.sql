-- CDS Space: manual-start override for the objective screening test.
-- Normally the objective test opens automatically at scheduled_at. This flag
-- lets an admin open it on demand (e.g. start the test in the room), regardless
-- of the scheduled time. Idempotent - apply by hand against GlashDB.

alter table public.screening_candidates
  add column if not exists objective_unlocked boolean not null default false;
