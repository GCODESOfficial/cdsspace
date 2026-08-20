-- 20260728_hrm_taskboard.sql
-- Cohesive HRM taskboard shared by the admin and team portals.
--
-- The board is deliberately independent from finance projects: it can hold
-- personal, departmental and company work, while individual tasks may still
-- link to internal cDocs, uploaded files and external references.

create extension if not exists pgcrypto;

create table if not exists public.task_boards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  color text not null default '#0A4FE8',
  created_by_kind text not null default 'admin'
    check (created_by_kind in ('admin', 'team')),
  created_by_id text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_board_members (
  board_id uuid not null references public.task_boards(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  role text not null default 'editor'
    check (role in ('owner', 'editor', 'viewer')),
  added_by_id text,
  created_at timestamptz not null default now(),
  primary key (board_id, team_member_id)
);

create table if not exists public.task_board_lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.task_boards(id) on delete cascade,
  title text not null,
  position integer not null default 1000,
  created_by_kind text
    check (created_by_kind in ('admin', 'team')),
  created_by_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task_board_lists
  add column if not exists created_by_kind text,
  add column if not exists created_by_id text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'task_board_lists_created_by_kind_check'
       and conrelid = 'public.task_board_lists'::regclass
  ) then
    alter table public.task_board_lists
      add constraint task_board_lists_created_by_kind_check
      check (created_by_kind in ('admin', 'team'));
  end if;
end $$;

create table if not exists public.task_board_tasks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.task_boards(id) on delete cascade,
  list_id uuid not null references public.task_board_lists(id) on delete cascade,
  title text not null,
  notes text,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  due_at timestamptz,
  position integer not null default 1000,
  completed_at timestamptz,
  created_by_kind text not null default 'admin'
    check (created_by_kind in ('admin', 'team')),
  created_by_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task_board_tasks
  add column if not exists source_type text,
  add column if not exists source_id uuid;

create table if not exists public.task_board_task_assignees (
  task_id uuid not null references public.task_board_tasks(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  assigned_by_id text,
  created_at timestamptz not null default now(),
  primary key (task_id, team_member_id)
);

create table if not exists public.task_board_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.task_board_tasks(id) on delete cascade,
  kind text not null default 'upload'
    check (kind in ('upload', 'external', 'cdoc')),
  title text not null,
  url text not null,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  created_by_kind text not null default 'admin'
    check (created_by_kind in ('admin', 'team')),
  created_by_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.task_board_activity (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.task_boards(id) on delete cascade,
  task_id uuid references public.task_board_tasks(id) on delete cascade,
  actor_kind text not null default 'admin'
    check (actor_kind in ('admin', 'team', 'system')),
  actor_id text,
  actor_name text,
  event_type text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_board_members_member
  on public.task_board_members (team_member_id, board_id);
create index if not exists idx_task_board_lists_order
  on public.task_board_lists (board_id, position, created_at);
create index if not exists idx_task_board_lists_creator
  on public.task_board_lists (board_id, created_by_kind, created_by_id);
create index if not exists idx_task_board_tasks_order
  on public.task_board_tasks (list_id, position, created_at);
create index if not exists idx_task_board_tasks_due
  on public.task_board_tasks (board_id, due_at)
  where completed_at is null;
create unique index if not exists uq_task_board_tasks_source
  on public.task_board_tasks (source_type, source_id)
  where source_type is not null and source_id is not null;
create index if not exists idx_task_board_assignees_member
  on public.task_board_task_assignees (team_member_id, task_id);
create index if not exists idx_task_board_activity_board
  on public.task_board_activity (board_id, created_at desc);

create or replace function public.touch_taskboard_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_task_boards_touch on public.task_boards;
create trigger trg_task_boards_touch
  before update on public.task_boards
  for each row execute function public.touch_taskboard_updated_at();

drop trigger if exists trg_task_board_lists_touch on public.task_board_lists;
create trigger trg_task_board_lists_touch
  before update on public.task_board_lists
  for each row execute function public.touch_taskboard_updated_at();

drop trigger if exists trg_task_board_tasks_touch on public.task_board_tasks;
create trigger trg_task_board_tasks_touch
  before update on public.task_board_tasks
  for each row execute function public.touch_taskboard_updated_at();

create or replace function public.add_team_member_to_default_taskboard()
returns trigger language plpgsql as $$
begin
  if new.is_active = true then
    insert into public.task_board_members (board_id, team_member_id, role, added_by_id)
    values ('00000000-0000-4000-8000-000000000101', new.id, 'editor', 'system')
    on conflict (board_id, team_member_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_team_member_default_taskboard on public.team_members;
create trigger trg_team_member_default_taskboard
  after insert or update of is_active on public.team_members
  for each row execute function public.add_team_member_to_default_taskboard();

-- Start with one useful shared board so the feature is not an empty shell.
insert into public.task_boards (
  id, title, description, color, created_by_kind, created_by_id
) values (
  '00000000-0000-4000-8000-000000000101',
  'Team Taskboard',
  'Shared company priorities, work in progress and completed tasks.',
  '#0A4FE8',
  'admin',
  'system'
) on conflict (id) do nothing;

insert into public.task_board_members (board_id, team_member_id, role, added_by_id)
select
  '00000000-0000-4000-8000-000000000101',
  id,
  'editor',
  'system'
from public.team_members
where is_active = true
on conflict (board_id, team_member_id) do nothing;

insert into public.task_board_lists (
  id, board_id, title, position, created_by_kind, created_by_id
)
values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000101', 'Inbox', 1000, 'admin', 'system'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000101', 'This week', 2000, 'admin', 'system'),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000101', 'In progress', 3000, 'admin', 'system'),
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-000000000101', 'Review', 4000, 'admin', 'system'),
  ('00000000-0000-4000-8000-000000000115', '00000000-0000-4000-8000-000000000101', 'Done', 5000, 'admin', 'system')
on conflict (id) do nothing;

-- Bring the fragmented direct/daily task records into the shared board once.
insert into public.task_board_tasks (
  board_id, list_id, title, notes, priority, due_at, position, completed_at,
  created_by_kind, created_by_id, created_at, updated_at, source_type, source_id
)
select
  '00000000-0000-4000-8000-000000000101',
  case
    when p.status in ('completed', 'approved') then '00000000-0000-4000-8000-000000000115'::uuid
    when p.status in ('in_progress', 'under_review', 'needs_revision') then '00000000-0000-4000-8000-000000000113'::uuid
    else '00000000-0000-4000-8000-000000000111'::uuid
  end,
  p.title,
  p.description,
  case when p.priority in ('low', 'medium', 'high', 'urgent') then p.priority else 'medium' end,
  case when p.due_date is not null then (p.due_date + time '17:00') at time zone 'Africa/Lagos' else null end,
  row_number() over (partition by p.status order by p.created_at)::int * 1000,
  p.completed_at,
  case when p.created_by_admin then 'admin' else 'team' end,
  coalesce(p.created_by_member_id::text, p.assigned_by_member_id::text, 'legacy'),
  p.created_at,
  p.updated_at,
  'project_task',
  p.id
from public.project_tasks p
where p.project_id is null or p.origin = 'direct'
on conflict (source_type, source_id) where source_type is not null and source_id is not null do nothing;

insert into public.task_board_task_assignees (task_id, team_member_id, assigned_by_id)
select t.id, p.assignee_id, 'legacy'
from public.task_board_tasks t
join public.project_tasks p on t.source_type = 'project_task' and t.source_id = p.id
where p.assignee_id is not null
on conflict (task_id, team_member_id) do nothing;

insert into public.task_board_attachments (
  task_id, kind, title, url, created_by_kind, created_by_id
)
select
  t.id,
  'external',
  coalesce(nullif(p.attachment_name, ''), 'Legacy task attachment'),
  p.attachment_url,
  'admin',
  'legacy'
from public.task_board_tasks t
join public.project_tasks p on t.source_type = 'project_task' and t.source_id = p.id
where p.attachment_url is not null and p.attachment_url <> ''
  and not exists (
    select 1 from public.task_board_attachments a
    where a.task_id = t.id and a.url = p.attachment_url
  );

update public.team_work_tracking_settings
set
  capture_interval_seconds = greatest(capture_interval_seconds, 300),
  privacy_notice = 'Work activity uses persistent attendance-linked heartbeats and member-selected task context. It does not request screen sharing, record video or store screenshots.',
  updated_at = now()
where id = 1;

do $$
declare
  table_name text;
  taskboard_tables text[] := array[
    'task_boards',
    'task_board_members',
    'task_board_lists',
    'task_board_tasks',
    'task_board_task_assignees',
    'task_board_attachments',
    'task_board_activity'
  ];
begin
  foreach table_name in array taskboard_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', 'allow_all_' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for all using (true) with check (true)',
      'allow_all_' || table_name,
      table_name
    );
    execute format(
      'grant select, insert, update, delete on public.%I to anon, authenticated, service_role',
      table_name
    );
  end loop;
end $$;
