create extension if not exists pgcrypto;

alter table public.finance_projects
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists priority text not null default 'medium',
  add column if not exists internal_deadline date,
  add column if not exists client_delivery_date date,
  add column if not exists revision_deadline date,
  add column if not exists launch_date date,
  add column if not exists completion_date date,
  add column if not exists project_manager_id uuid references public.team_members(id) on delete set null,
  add column if not exists department_lead_id uuid references public.team_members(id) on delete set null,
  add column if not exists progress_override integer,
  add column if not exists visibility text not null default 'internal',
  add column if not exists archived_at timestamptz;

alter table public.project_documents
  add column if not exists folder text,
  add column if not exists description text,
  add column if not exists visibility text not null default 'internal';

alter table public.finance_milestones
  add column if not exists milestone_key text,
  add column if not exists due_date date,
  add column if not exists approval_status text not null default 'pending',
  add column if not exists progress integer not null default 0;

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.finance_projects(id) on delete cascade,
  milestone_id uuid references public.finance_milestones(id) on delete set null,
  title text not null,
  description text,
  assignee_id uuid references public.team_members(id) on delete set null,
  reviewer_id uuid references public.team_members(id) on delete set null,
  department text,
  priority text not null default 'medium',
  status text not null default 'not_started',
  progress integer not null default 0,
  due_date date,
  created_by_member_id uuid references public.team_members(id) on delete set null,
  created_by_admin boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_tasks_progress_range check (progress >= 0 and progress <= 100)
);

create table if not exists public.project_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  project_id uuid not null references public.finance_projects(id) on delete cascade,
  author_member_id uuid references public.team_members(id) on delete set null,
  author_is_admin boolean not null default false,
  body text not null,
  internal_only boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.project_task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.project_tasks(id) on delete cascade,
  project_id uuid not null references public.finance_projects(id) on delete cascade,
  title text not null,
  file_url text not null,
  folder text,
  uploaded_by_member_id uuid references public.team_members(id) on delete set null,
  uploaded_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.project_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.finance_projects(id) on delete cascade,
  task_id uuid references public.project_tasks(id) on delete cascade,
  milestone_id uuid references public.finance_milestones(id) on delete set null,
  requested_by_member_id uuid references public.team_members(id) on delete set null,
  reviewer_member_id uuid references public.team_members(id) on delete set null,
  client_name text,
  approval_type text not null default 'internal_review',
  status text not null default 'pending',
  note text,
  decision_note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.project_activity_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.finance_projects(id) on delete cascade,
  actor_member_id uuid references public.team_members(id) on delete set null,
  actor_is_admin boolean not null default false,
  action text not null,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_calendar_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.finance_projects(id) on delete cascade,
  source_type text,
  source_id uuid,
  title text not null,
  event_date date not null,
  event_time time,
  event_kind text not null default 'deadline',
  status text not null default 'scheduled',
  visibility text not null default 'internal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_finance_projects_status_deadline
  on public.finance_projects(status, client_delivery_date, duration_end);
create index if not exists idx_project_assignments_member
  on public.project_assignments(team_member_id, project_id);
create index if not exists idx_project_assignments_department
  on public.project_assignments(lower(department), project_id);
create index if not exists idx_project_tasks_project
  on public.project_tasks(project_id, status, due_date);
create index if not exists idx_project_tasks_assignee
  on public.project_tasks(assignee_id, status, due_date);
create index if not exists idx_project_task_comments_task
  on public.project_task_comments(task_id, created_at);
create index if not exists idx_project_activity_project
  on public.project_activity_events(project_id, created_at desc);
create index if not exists idx_project_calendar_date
  on public.project_calendar_events(event_date, project_id);

