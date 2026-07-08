-- CDS Space: delegate objective-question authoring to a team member.
-- An admin can assign one or more team members to set the screening objective
-- questions for a specific open role. Assigned members get a focused
-- /team/screening page (team portal) where they can author ONLY their roles.
-- Idempotent - apply by hand against GlashDB.

create table if not exists public.screening_role_setters (
  id              uuid primary key default gen_random_uuid(),
  role_id         uuid not null references public.open_roles(id) on delete cascade,
  team_member_id  uuid not null references public.team_members(id) on delete cascade,
  assigned_by     text,                       -- admin name/email who assigned
  created_at      timestamptz not null default now(),
  unique (role_id, team_member_id)
);

create index if not exists screening_role_setters_member_idx
  on public.screening_role_setters (team_member_id);
create index if not exists screening_role_setters_role_idx
  on public.screening_role_setters (role_id);
