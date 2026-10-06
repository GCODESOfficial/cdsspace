-- Team members may stay signed in on up to three devices at once (web, desktop
-- and the mobile app). createTeamSession ends the oldest session when a fourth
-- device signs in, so the one-session-per-member unique index has to go.

drop index if exists public.team_device_sessions_one_active_member_idx;

create index if not exists team_device_sessions_member_active_idx
  on public.team_device_sessions(team_member_id, created_at desc)
  where revoked_at is null;

comment on index public.team_device_sessions_member_active_idx is
  'Security policy: a team member may have up to three active device sessions. A new login beyond that revokes the oldest.';
