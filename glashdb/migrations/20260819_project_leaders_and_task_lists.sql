-- Assignment-scoped projects, explicit project leaders, and automatic
-- project taskboard lists for every newly created project task.

alter table public.project_assignments
  add column if not exists is_project_leader boolean not null default false,
  add column if not exists can_edit_project boolean not null default false,
  add column if not exists can_manage_tasks boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'project_assignments_leader_member_check'
       and conrelid = 'public.project_assignments'::regclass
  ) then
    alter table public.project_assignments
      add constraint project_assignments_leader_member_check
      check (not is_project_leader or team_member_id is not null);
  end if;
end $$;

update public.project_assignments pa
   set is_project_leader = true,
       can_edit_project = true,
       can_manage_tasks = true
  from public.finance_projects p
 where pa.project_id = p.id
   and pa.team_member_id is not null
   and pa.team_member_id in (p.project_manager_id, p.department_lead_id);

alter table public.task_board_lists
  add column if not exists source_type text,
  add column if not exists source_id uuid;

create unique index if not exists uq_task_board_lists_source
  on public.task_board_lists (source_type, source_id)
  where source_type is not null and source_id is not null;

create or replace function public.refresh_project_task_list_members(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list_id uuid;
begin
  select id into v_list_id
    from public.task_board_lists
   where source_type = 'finance_project' and source_id = p_project_id
   limit 1;
  if v_list_id is null then return; end if;

  delete from public.task_board_list_members where list_id = v_list_id;

  with relevant_members as (
    select pa.team_member_id as id
      from public.project_assignments pa
     where pa.project_id = p_project_id and pa.team_member_id is not null
    union
    select m.id
      from public.project_assignments pa
      join public.team_members m on m.is_active = true
     where pa.project_id = p_project_id
       and pa.department is not null
       and (
         lower(m.department) = lower(pa.department)
         or exists (
           select 1 from public.team_member_departments tmd
           join public.departments d on d.id = tmd.department_id
            where tmd.team_member_id = m.id and lower(d.name) = lower(pa.department)
         )
       )
    union
    select p.project_manager_id from public.finance_projects p where p.id = p_project_id and p.project_manager_id is not null
    union
    select p.department_lead_id from public.finance_projects p where p.id = p_project_id and p.department_lead_id is not null
    union
    select t.assignee_id from public.project_tasks t where t.project_id = p_project_id and t.assignee_id is not null
    union
    select t.reviewer_id from public.project_tasks t where t.project_id = p_project_id and t.reviewer_id is not null
  )
  insert into public.task_board_list_members (list_id, team_member_id, added_by_id)
  select v_list_id, rm.id, 'project-system'
    from relevant_members rm
    join public.team_members m on m.id = rm.id and m.is_active = true
  on conflict (list_id, team_member_id) do nothing;
end $$;

create or replace function public.sync_project_task_to_taskboard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_id uuid := '00000000-0000-4000-8000-000000000101'::uuid;
  v_list_id uuid;
  v_board_task_id uuid;
  v_project_name text;
begin
  select p.name into v_project_name
    from public.finance_projects p
   where p.id = new.project_id;

  if v_project_name is null then
    return new;
  end if;

  insert into public.task_board_lists
    (board_id, title, position, created_by_kind, created_by_id, source_type, source_id)
  values (
    v_board_id,
    left(v_project_name, 180),
    coalesce((select max(position) + 1000 from public.task_board_lists where board_id = v_board_id), 1000),
    'admin',
    'project-system',
    'finance_project',
    new.project_id
  )
  on conflict (source_type, source_id)
    where source_type is not null and source_id is not null
  do update set title = excluded.title, updated_at = now()
  returning id into v_list_id;

  with relevant_members as (
    select pa.team_member_id as id
      from public.project_assignments pa
     where pa.project_id = new.project_id and pa.team_member_id is not null
    union
    select m.id
      from public.project_assignments pa
      join public.team_members m on m.is_active = true
     where pa.project_id = new.project_id
       and pa.department is not null
       and (
         lower(m.department) = lower(pa.department)
         or exists (
           select 1 from public.team_member_departments tmd
           join public.departments d on d.id = tmd.department_id
            where tmd.team_member_id = m.id and lower(d.name) = lower(pa.department)
         )
       )
    union
    select p.project_manager_id from public.finance_projects p where p.id = new.project_id and p.project_manager_id is not null
    union
    select p.department_lead_id from public.finance_projects p where p.id = new.project_id and p.department_lead_id is not null
    union
    select new.assignee_id where new.assignee_id is not null
    union
    select new.reviewer_id where new.reviewer_id is not null
  )
  insert into public.task_board_list_members (list_id, team_member_id, added_by_id)
  select v_list_id, rm.id, 'project-system'
    from relevant_members rm
    join public.team_members m on m.id = rm.id and m.is_active = true
  on conflict (list_id, team_member_id) do nothing;

  insert into public.task_board_tasks (
    board_id, list_id, title, notes, priority, due_at, position, completed_at,
    created_by_kind, created_by_id, source_type, source_id
  ) values (
    v_board_id,
    v_list_id,
    new.title,
    new.description,
    case when new.priority in ('low','medium','high','urgent') then new.priority else 'medium' end,
    case when new.due_date is not null then (new.due_date + time '17:00') at time zone 'Africa/Lagos' else null end,
    coalesce((select max(position) + 1000 from public.task_board_tasks where list_id = v_list_id), 1000),
    new.completed_at,
    case when new.created_by_admin then 'admin' else 'team' end,
    coalesce(new.created_by_member_id::text, 'project-system'),
    'project_task',
    new.id
  )
  on conflict (source_type, source_id)
    where source_type is not null and source_id is not null
  do update set
    list_id = excluded.list_id,
    title = excluded.title,
    notes = excluded.notes,
    priority = excluded.priority,
    due_at = excluded.due_at,
    completed_at = excluded.completed_at,
    updated_at = now()
  returning id into v_board_task_id;

  if new.assignee_id is not null then
    insert into public.task_board_task_assignees (task_id, team_member_id, assigned_by_id)
    values (v_board_task_id, new.assignee_id, coalesce(new.created_by_member_id::text, 'project-system'))
    on conflict (task_id, team_member_id) do nothing;
  end if;
  if new.reviewer_id is not null then
    insert into public.task_board_task_assignees (task_id, team_member_id, assigned_by_id)
    values (v_board_task_id, new.reviewer_id, coalesce(new.created_by_member_id::text, 'project-system'))
    on conflict (task_id, team_member_id) do nothing;
  end if;

  perform public.refresh_project_task_list_members(new.project_id);

  if tg_op = 'INSERT' then
    with recipients as (
      select lm.team_member_id as id
        from public.task_board_list_members lm
       where lm.list_id = v_list_id
    )
    insert into public.team_notifications
      (recipient_id, kind, title, body, link, actor_member_id, actor_is_admin)
    select id, 'project_task_created', 'New project task: ' || left(new.title, 140),
           'A task was added to ' || left(v_project_name, 140) || '.',
           '/team/taskboard?task=' || v_board_task_id::text,
           new.created_by_member_id,
           new.created_by_admin
      from recipients;

    insert into public.team_notifications
      (for_admin, kind, title, body, link, actor_member_id, actor_is_admin)
    values (
      true,
      'project_task_created',
      'New project task: ' || left(new.title, 140),
      'A task was added to ' || left(v_project_name, 140) || '.',
      '/admin/hrm/taskboard?task=' || v_board_task_id::text,
      new.created_by_member_id,
      new.created_by_admin
    );

    insert into public.task_board_activity
      (board_id, task_id, actor_kind, actor_id, event_type, detail, metadata)
    values (
      v_board_id,
      v_board_task_id,
      'system',
      'project-system',
      'project_task_created',
      'Created from project ' || v_project_name,
      jsonb_build_object('project_id', new.project_id, 'project_task_id', new.id)
    );
  end if;

  update public.task_boards set updated_at = now() where id = v_board_id;
  return new;
end $$;

drop trigger if exists trg_sync_project_task_to_taskboard on public.project_tasks;
create trigger trg_sync_project_task_to_taskboard
  after insert or update of title, description, priority, due_date, completed_at, assignee_id, reviewer_id
  on public.project_tasks
  for each row execute function public.sync_project_task_to_taskboard();

create or replace function public.refresh_project_task_list_members_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_project_task_list_members(old.project_id);
    return old;
  end if;
  perform public.refresh_project_task_list_members(new.project_id);
  return new;
end $$;

drop trigger if exists trg_refresh_project_task_list_members on public.project_assignments;
create trigger trg_refresh_project_task_list_members
  after insert or update or delete on public.project_assignments
  for each row execute function public.refresh_project_task_list_members_from_assignment();
