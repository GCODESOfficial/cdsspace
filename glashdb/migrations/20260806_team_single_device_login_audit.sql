-- Enforce one active device per team member and retain detailed, immutable
-- login context on every session row for the security audit report.

alter table public.team_device_sessions
  add column if not exists browser_name text,
  add column if not exists os_name text,
  add column if not exists device_name text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text,
  add column if not exists country_code text,
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists timezone text,
  add column if not exists login_source text;

update public.team_device_sessions
   set revoked_at = coalesce(revoked_at, now()),
       revoke_reason = coalesce(revoke_reason, 'expired')
 where revoked_at is null
   and expires_at <= now();

with ranked as (
  select id,
         row_number() over (
           partition by team_member_id
           order by created_at desc, id desc
         ) as session_rank
    from public.team_device_sessions
   where revoked_at is null
)
update public.team_device_sessions session
   set revoked_at = now(),
       revoke_reason = 'single_device_policy_migration'
  from ranked
 where session.id = ranked.id
   and ranked.session_rank > 1;

drop index if exists public.team_device_sessions_one_active_type_idx;

create unique index if not exists team_device_sessions_one_active_member_idx
  on public.team_device_sessions(team_member_id)
  where revoked_at is null;

create index if not exists team_device_sessions_login_audit_idx
  on public.team_device_sessions(team_member_id, created_at desc);

comment on index public.team_device_sessions_one_active_member_idx is
  'Security policy: a team member may have only one active device session. A new login revokes the previous session.';

comment on column public.team_device_sessions.device_name is
  'Human-readable platform and browser captured at team login.';

comment on column public.team_device_sessions.login_source is
  'The authentication flow that created the session, such as team_login, face_login, invite, or admin_bridge.';
