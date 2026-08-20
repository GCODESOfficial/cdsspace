-- CDS Space: admin-editable office geofence for team attendance check-in.
-- ---------------------------------------------------------------------------
-- A single-row settings table holding the office coordinates + radius used by
-- the clock-in geofence. When empty/absent, the app falls back to the hardcoded
-- TIMEBOOK_OFFICE default in src/lib/timebook.ts.
--
-- Migrations here are MANUAL (no runner) - apply this SQL by hand against
-- GlashDB. Idempotent (IF NOT EXISTS).
-- ---------------------------------------------------------------------------

create table if not exists public.team_timebook_office (
  id            int primary key default 1,
  name          text,
  address       text,
  latitude      double precision not null,
  longitude     double precision not null,
  radius_meters int not null default 150,
  updated_by    text,
  updated_at    timestamptz not null default now(),
  constraint team_timebook_office_singleton check (id = 1)
);
