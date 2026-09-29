-- Access from anywhere. A super admin can exempt selected admin staff from the
-- office geofence, so their face sign-in and clock-in succeed wherever they
-- are. Their location is still recorded; it just no longer blocks them.

alter table public.team_members
  add column if not exists access_anywhere boolean not null default false,
  add column if not exists access_anywhere_set_by text,
  add column if not exists access_anywhere_set_at timestamptz;
