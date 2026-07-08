-- ============================================================
-- CDS Space: Team Daily Task Management
-- Adds direct (non-project) task assignment, a team-lead flag,
-- member daily close-of-work reports, blocker escalations, and
-- per-member/day role checklist completion.
-- Run manually in the GlashDB SQL editor (no migration runner).
-- ============================================================

-- 1) Allow tasks that are NOT tied to a project (direct daily assignments),
--    and record who assigned them + where the task originated.
alter table public.project_tasks alter column project_id drop not null;
alter table public.project_tasks add column if not exists assigned_by_member_id uuid references public.team_members(id) on delete set null;
alter table public.project_tasks add column if not exists origin text not null default 'project';  -- 'project' | 'direct'

-- 2) First-class Team Lead flag. A lead may assign tasks to members in
--    their own department without full sub-admin permissions.
alter table public.team_members add column if not exists is_team_lead boolean not null default false;

-- 3) Member daily close-of-work report (one per member per working day).
create table if not exists public.team_daily_reports (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  work_date date not null,
  completed text,           -- what got done today
  pending text,             -- what is still pending
  blockers text,            -- blockers / issues
  priorities text,          -- priorities for next workday
  evidence_links jsonb not null default '[]'::jsonb,  -- links/screenshots to delivery evidence
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_member_id, work_date)
);
create index if not exists team_daily_reports_date_idx on public.team_daily_reports (work_date);

-- 4) Blocker escalations (PDF: escalate within 10 minutes of discovery).
create table if not exists public.team_blockers (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  task_id uuid references public.project_tasks(id) on delete set null,
  title text not null,
  detail text,
  severity text not null default 'medium',   -- low | medium | high | critical
  status text not null default 'open',        -- open | acknowledged | resolved
  escalated_to_member_id uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists team_blockers_status_idx on public.team_blockers (status);
create index if not exists team_blockers_member_idx on public.team_blockers (team_member_id);

-- 5) Per-member/day completion of role-based compulsory checklist items.
--    The item catalogue itself lives in code (src/lib/team-tasks/role-templates.ts);
--    only completion state is persisted here, keyed by a stable template key.
create table if not exists public.team_daily_checklist (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  work_date date not null,
  template_key text not null,     -- e.g. "universal:task:2" or "creative_designer:evidence:1"
  role_key text,
  kind text not null default 'task',  -- 'task' | 'evidence'
  label text not null,
  done boolean not null default false,
  done_at timestamptz,
  evidence_link text,
  unique (team_member_id, work_date, template_key)
);
create index if not exists team_daily_checklist_lookup_idx on public.team_daily_checklist (team_member_id, work_date);
