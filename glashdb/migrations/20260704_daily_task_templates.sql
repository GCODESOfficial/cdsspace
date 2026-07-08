-- Admin-configurable daily task templates.
--
-- The "Compulsory daily tasks" checklist shipped hardcoded in
-- src/lib/team-tasks/role-templates.ts. This table lets admins override those
-- per scope (universal / role / member) from the admin dashboard. When rows
-- exist for a scope+key they REPLACE the code defaults for that scope; otherwise
-- the code defaults are used. Member-scope rows are always appended.
--
-- Completion is still tracked in team_daily_checklist keyed by template_key
-- (DB items use the key `db:<id>`), so no change is needed there.

create table if not exists public.team_task_templates (
    id          uuid primary key default gen_random_uuid(),
    scope       text not null check (scope in ('universal', 'role', 'member')),
    role_key    text,                                   -- set when scope = 'role'
    member_id   uuid references public.team_members(id) on delete cascade,  -- set when scope = 'member'
    kind        text not null default 'task' check (kind in ('task', 'evidence')),
    label       text not null,
    position    int  not null default 0,
    active      boolean not null default true,
    created_by  uuid,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists team_task_templates_scope_role_idx
    on public.team_task_templates (scope, role_key) where active;
create index if not exists team_task_templates_member_idx
    on public.team_task_templates (member_id) where active;
