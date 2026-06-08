import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/admin-permissions";
import { getTeamSession, type TeamSession } from "@/lib/team-auth";
import { glashMaybeOne, glashOne, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_STATUSES = new Set(["new", "active", "paused", "delayed", "awaiting_client", "under_review", "completed", "archived"]);
const PROJECT_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const TASK_STATUSES = new Set(["not_started", "in_progress", "under_review", "needs_revision", "approved", "completed", "delayed"]);
const TASK_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

type ProjectRow = {
  id: string;
  name: string;
  client: string | null;
  currency: string | null;
  duration_start: string | null;
  duration_end: string | null;
  status: string;
  notes: string | null;
  category: string | null;
  description: string | null;
  priority: string;
  internal_deadline: string | null;
  client_delivery_date: string | null;
  revision_deadline: string | null;
  launch_date: string | null;
  completion_date: string | null;
  project_manager_id: string | null;
  department_lead_id: string | null;
  progress_override: number | null;
  visibility: string;
  created_at: string;
  updated_at: string;
  project_manager_name: string | null;
  department_lead_name: string | null;
};

type AssignmentRow = {
  id: string;
  project_id: string;
  team_member_id: string | null;
  department: string | null;
  role: string | null;
  created_at: string;
  member_name: string | null;
  member_email: string | null;
  member_role_title: string | null;
  member_department: string | null;
  member_avatar_url: string | null;
};

type MilestoneRow = {
  id: string;
  project_id: string;
  description: string;
  assigned_to: string | null;
  duration_start: string | null;
  duration_end: string | null;
  status: string;
  position: number;
  milestone_key: string | null;
  due_date: string | null;
  approval_status: string;
  progress: number;
};

type TaskRow = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  reviewer_id: string | null;
  department: string | null;
  priority: string;
  status: string;
  progress: number;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignee_name: string | null;
  reviewer_name: string | null;
};

type DocumentRow = {
  id: string;
  project_id: string;
  kind: string;
  title: string;
  file_url: string | null;
  folder: string | null;
  description: string | null;
  visibility: string;
  created_at: string;
};

type ApprovalRow = {
  id: string;
  project_id: string;
  task_id: string | null;
  milestone_id: string | null;
  requested_by_member_id: string | null;
  reviewer_member_id: string | null;
  client_name: string | null;
  approval_type: string;
  status: string;
  note: string | null;
  decision_note: string | null;
  requested_at: string;
  decided_at: string | null;
  requested_by_name: string | null;
  reviewer_name: string | null;
};

type ActivityRow = {
  id: string;
  project_id: string;
  actor_member_id: string | null;
  actor_is_admin: boolean;
  action: string;
  title: string;
  body: string | null;
  created_at: string;
  actor_name: string | null;
};

type CalendarEvent = {
  id: string;
  project_id: string;
  title: string;
  event_date: string;
  event_kind: string;
  status: string;
  source_type: string;
};

type TeamMemberOption = {
  id: string;
  full_name: string;
  username: string;
  department: string | null;
  role_title: string | null;
  avatar_url: string | null;
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function cleanDate(value: unknown) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanUuid(value: unknown) {
  const text = cleanText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function permission(session: TeamSession, key: string) {
  return session.is_sub_admin && hasPermission(session.permissions || [], key);
}

function canViewAllProjects(session: TeamSession) {
  return permission(session, "projects.view") || permission(session, "finance.manage");
}

function canCreateProjects(session: TeamSession) {
  return permission(session, "projects.create") || permission(session, "finance.manage");
}

function canEditProjects(session: TeamSession) {
  return permission(session, "projects.edit") || permission(session, "projects.manage_milestones") || permission(session, "finance.manage");
}

function normalizeStatus(value: unknown, allowed: Set<string>, fallback: string) {
  const normalized = cleanText(value).toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizePriority(value: unknown) {
  return normalizeStatus(value, PROJECT_PRIORITIES, "medium");
}

function taskProgress(status: string, progress: number) {
  if (status === "completed" || status === "approved") return 100;
  if (status === "not_started") return Math.min(progress || 0, 10);
  return Math.max(15, Math.min(95, Number(progress || 0)));
}

function computeProjectProgress(project: ProjectRow, tasks: TaskRow[], milestones: MilestoneRow[]) {
  if (project.progress_override != null) return Math.max(0, Math.min(100, Number(project.progress_override)));
  const projectTasks = tasks.filter((task) => task.project_id === project.id);
  if (projectTasks.length) {
    const total = projectTasks.reduce((sum, task) => sum + taskProgress(task.status, task.progress), 0);
    return Math.round(total / projectTasks.length);
  }
  const projectMilestones = milestones.filter((milestone) => milestone.project_id === project.id);
  if (projectMilestones.length) {
    const total = projectMilestones.reduce((sum, milestone) => {
      if (["completed", "paid", "approved"].includes(milestone.status) || milestone.approval_status === "approved") return sum + 100;
      if (milestone.status === "in_progress") return sum + Math.max(25, milestone.progress || 40);
      return sum + Math.max(0, milestone.progress || 0);
    }, 0);
    return Math.round(total / projectMilestones.length);
  }
  return project.status === "completed" ? 100 : 0;
}

function derivedProjectEvents(projects: ProjectRow[], tasks: TaskRow[], milestones: MilestoneRow[], stored: CalendarEvent[]) {
  const events: CalendarEvent[] = [...stored];
  const add = (project_id: string, source_type: string, title: string, event_date: string | null, event_kind: string, status = "scheduled") => {
    if (!event_date) return;
    events.push({
      id: `${source_type}-${project_id}-${event_date}-${title}`,
      project_id,
      title,
      event_date,
      event_kind,
      status,
      source_type,
    });
  };
  projects.forEach((project) => {
    add(project.id, "project_start", `${project.name} starts`, project.duration_start, "start");
    add(project.id, "internal_deadline", `${project.name} internal deadline`, project.internal_deadline, "internal_deadline");
    add(project.id, "client_delivery", `${project.name} client delivery`, project.client_delivery_date || project.duration_end, "client_delivery");
    add(project.id, "revision_deadline", `${project.name} revisions due`, project.revision_deadline, "revision");
    add(project.id, "launch", `${project.name} launch`, project.launch_date, "launch");
    add(project.id, "completion", `${project.name} completion`, project.completion_date, "completion");
  });
  tasks.forEach((task) => add(task.project_id, "task", task.title, task.due_date, "task_deadline", task.status));
  milestones.forEach((milestone) => add(
    milestone.project_id,
    "milestone",
    milestone.description,
    milestone.due_date || milestone.duration_end,
    "milestone_due",
    milestone.status,
  ));
  return events
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .slice(0, 80);
}

async function visibleProjects(session: TeamSession) {
  return glashQuery<ProjectRow>(
    `select p.*,
            pm.full_name as project_manager_name,
            dl.full_name as department_lead_name
       from public.finance_projects p
       left join public.team_members pm on pm.id = p.project_manager_id
       left join public.team_members dl on dl.id = p.department_lead_id
      where (
        $2::boolean = true
        or p.project_manager_id = $1::uuid
        or p.department_lead_id = $1::uuid
        or exists (
          select 1
            from public.project_assignments pa
           where pa.project_id = p.id
             and (
               pa.team_member_id = $1::uuid
               or (
                 pa.department is not null
                 and lower(pa.department) = lower(coalesce($3::text, ''))
               )
             )
        )
      )
        and p.status <> 'archived'
      order by coalesce(p.client_delivery_date, p.duration_end, p.updated_at::date, p.created_at::date) asc`,
    [session.id, canViewAllProjects(session), session.department ?? ""],
  );
}

async function projectIsVisible(session: TeamSession, projectId: string) {
  const project = await glashMaybeOne<{ id: string }>(
    `select p.id
       from public.finance_projects p
      where p.id = $4::uuid
        and (
          $2::boolean = true
          or p.project_manager_id = $1::uuid
          or p.department_lead_id = $1::uuid
          or exists (
            select 1 from public.project_assignments pa
             where pa.project_id = p.id
               and (
                 pa.team_member_id = $1::uuid
                 or (pa.department is not null and lower(pa.department) = lower(coalesce($3::text, '')))
               )
          )
        )
      limit 1`,
    [session.id, canViewAllProjects(session), session.department ?? "", projectId],
  );
  return Boolean(project);
}

async function addActivity(input: {
  projectId: string;
  session: TeamSession;
  action: string;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await glashQuery(
    `insert into public.project_activity_events
      (project_id, actor_member_id, actor_is_admin, action, title, body, metadata)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      input.projectId,
      input.session.id,
      input.session.is_sub_admin,
      input.action,
      input.title,
      input.body ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  ).catch(() => []);
}

async function notifyMembers(projectId: string, recipientIds: string[], title: string, body: string, kind = "project_update") {
  const ids = Array.from(new Set(recipientIds.filter(Boolean)));
  if (!ids.length) return;
  await glashQuery(
    `insert into public.team_notifications (recipient_id, kind, title, body, link, actor_is_admin)
     select unnest($1::uuid[]), $2, $3, $4, $5, true`,
    [ids, kind, title, body, `/team/work?project=${projectId}`],
  ).catch(() => []);
}

async function projectRecipients(projectId: string) {
  const rows = await glashQuery<{ id: string }>(
    `with direct_members as (
       select m.id
         from public.project_assignments pa
         join public.team_members m on m.id = pa.team_member_id and m.is_active = true
        where pa.project_id = $1
     ),
     department_members as (
       select m.id
         from public.project_assignments pa
         join public.team_members m on lower(m.department) = lower(pa.department) and m.is_active = true
        where pa.project_id = $1
          and pa.department is not null
     )
     select distinct id
       from (
         select id from direct_members
         union all
         select id from department_members
       ) members`,
    [projectId],
  );
  return rows.map((row) => row.id);
}

export async function GET() {
  const session = await getTeamSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projects = await visibleProjects(session);
  const projectIds = projects.map((project) => project.id);
  const canManage = canEditProjects(session);
  const canCreate = canCreateProjects(session);

  const teamMembers = await glashQuery<TeamMemberOption>(
    `select id, full_name, username, department, role_title, avatar_url
       from public.team_members
      where is_active = true
      order by full_name asc`,
  );
  const departments = Array.from(new Set(teamMembers.map((member) => member.department).filter((value): value is string => Boolean(value))));

  if (!projectIds.length) {
    return NextResponse.json({
      ok: true,
      projects: [],
      assignments: [],
      milestones: [],
      tasks: [],
      documents: [],
      approvals: [],
      activity: [],
      calendar_events: [],
      chat_threads: [],
      team_members: canCreate || canManage ? teamMembers : [],
      departments,
      capabilities: { can_create_project: canCreate, can_manage_projects: canManage },
      stats: { total: 0, active: 0, completed: 0, delayed: 0, upcoming_deadlines: 0, pending_approvals: 0, overdue_tasks: 0 },
    });
  }

  const [assignments, milestones, tasks, documents, approvals, activity, storedEvents, chatThreads] = await Promise.all([
    glashQuery<AssignmentRow>(
      `with deduped as (
         select distinct on (
                pa.project_id,
                coalesce(pa.team_member_id::text, ''),
                lower(coalesce(pa.department, ''))
              )
              pa.*
         from public.project_assignments pa
        where pa.project_id = any($1::uuid[])
        order by pa.project_id,
                 coalesce(pa.team_member_id::text, ''),
                 lower(coalesce(pa.department, '')),
                 pa.created_at desc
       )
       select pa.*,
              m.full_name as member_name,
              m.email as member_email,
              m.role_title as member_role_title,
              m.department as member_department,
              m.avatar_url as member_avatar_url
         from deduped pa
         left join public.team_members m on m.id = pa.team_member_id
        order by pa.created_at asc`,
      [projectIds],
    ),
    glashQuery<MilestoneRow>(
      `select id, project_id, description, assigned_to, duration_start, duration_end, status,
              position, milestone_key, due_date, approval_status, progress
         from public.finance_milestones
        where project_id = any($1::uuid[])
        order by position asc, created_at asc`,
      [projectIds],
    ),
    glashQuery<TaskRow>(
      `select t.*,
              assignee.full_name as assignee_name,
              reviewer.full_name as reviewer_name
         from public.project_tasks t
         left join public.team_members assignee on assignee.id = t.assignee_id
         left join public.team_members reviewer on reviewer.id = t.reviewer_id
        where t.project_id = any($1::uuid[])
        order by coalesce(t.due_date, t.created_at::date) asc, t.created_at desc`,
      [projectIds],
    ),
    glashQuery<DocumentRow>(
      `select id, project_id, kind, title, file_url, folder, description, visibility, created_at
         from public.project_documents
        where project_id = any($1::uuid[])
        order by created_at desc`,
      [projectIds],
    ),
    glashQuery<ApprovalRow>(
      `select a.*,
              requester.full_name as requested_by_name,
              reviewer.full_name as reviewer_name
         from public.project_approvals a
         left join public.team_members requester on requester.id = a.requested_by_member_id
         left join public.team_members reviewer on reviewer.id = a.reviewer_member_id
        where a.project_id = any($1::uuid[])
        order by a.requested_at desc`,
      [projectIds],
    ),
    glashQuery<ActivityRow>(
      `select e.*,
              m.full_name as actor_name
         from public.project_activity_events e
         left join public.team_members m on m.id = e.actor_member_id
        where e.project_id = any($1::uuid[])
        order by e.created_at desc
        limit 80`,
      [projectIds],
    ),
    glashQuery<CalendarEvent>(
      `select id::text, project_id, title, event_date::text, event_kind, status, coalesce(source_type, 'manual') as source_type
         from public.project_calendar_events
        where project_id = any($1::uuid[])
        order by event_date asc`,
      [projectIds],
    ),
    glashQuery<{ id: string; project_id: string; name: string | null; created_at: string }>(
      `select id, project_id, name, created_at
         from public.team_chat_threads
        where project_id = any($1::uuid[])
        order by created_at desc`,
      [projectIds],
    ),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const enrichedProjects = projects.map((project) => ({
    ...project,
    progress: computeProjectProgress(project, tasks, milestones),
    task_count: tasks.filter((task) => task.project_id === project.id).length,
    milestone_count: milestones.filter((milestone) => milestone.project_id === project.id).length,
    team_count: assignments.filter((assignment) => assignment.project_id === project.id).length,
  }));
  const calendarEvents = derivedProjectEvents(projects, tasks, milestones, storedEvents);

  const stats = {
    total: projects.length,
    active: projects.filter((project) => ["new", "active", "under_review", "awaiting_client"].includes(project.status)).length,
    completed: projects.filter((project) => project.status === "completed").length,
    delayed: projects.filter((project) => project.status === "delayed").length + tasks.filter((task) => task.status === "delayed").length,
    upcoming_deadlines: calendarEvents.filter((event) => event.event_date >= today && event.event_date <= inSevenDays).length,
    pending_approvals: approvals.filter((approval) => approval.status === "pending").length,
    overdue_tasks: tasks.filter((task) => task.due_date && task.due_date < today && !["completed", "approved"].includes(task.status)).length,
  };

  return NextResponse.json({
    ok: true,
    projects: enrichedProjects,
    assignments,
    milestones,
    tasks,
    documents,
    approvals,
    activity,
    calendar_events: calendarEvents,
    chat_threads: chatThreads,
    team_members: canCreate || canManage ? teamMembers : [],
    departments,
    capabilities: { can_create_project: canCreate, can_manage_projects: canManage },
    stats,
  });
}

export async function POST(req: NextRequest) {
  const session = await getTeamSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = asRecord(await req.json().catch(() => ({})));
  const action = cleanText(body.action);

  if (action === "create_project") {
    if (!canCreateProjects(session)) {
      return NextResponse.json({ ok: false, error: "You do not have permission to create projects." }, { status: 403 });
    }
    const name = cleanText(body.name);
    const client = cleanText(body.client);
    if (!name || !client) {
      return NextResponse.json({ ok: false, error: "Project name and client name are required." }, { status: 400 });
    }
    const category = nullableText(body.category) || "Internal Project";
    const status = normalizeStatus(body.status, PROJECT_STATUSES, "new");
    const priority = normalizePriority(body.priority);
    const projectManagerId = cleanUuid(body.project_manager_id);
    const departmentLeadId = cleanUuid(body.department_lead_id);

    const project = await glashOne<ProjectRow>(
      `insert into public.finance_projects (
         name, client, currency, duration_start, duration_end, status, notes,
         category, description, priority, internal_deadline, client_delivery_date,
         revision_deadline, launch_date, completion_date, project_manager_id, department_lead_id
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       returning *, null::text as project_manager_name, null::text as department_lead_name`,
      [
        name,
        client,
        cleanText(body.currency) || "NGN",
        cleanDate(body.duration_start),
        cleanDate(body.duration_end),
        status,
        nullableText(body.notes),
        category,
        nullableText(body.description),
        priority,
        cleanDate(body.internal_deadline),
        cleanDate(body.client_delivery_date),
        cleanDate(body.revision_deadline),
        cleanDate(body.launch_date),
        cleanDate(body.completion_date),
        projectManagerId,
        departmentLeadId,
      ],
    );

    const assignmentRows: Array<[string, string]> = [];
    if (projectManagerId) assignmentRows.push([projectManagerId, "Project Manager"]);
    if (departmentLeadId && departmentLeadId !== projectManagerId) assignmentRows.push([departmentLeadId, "Department Lead"]);
    for (const [memberId, role] of assignmentRows) {
      await glashQuery(
        `insert into public.project_assignments (project_id, team_member_id, role)
         select $1, $2, $3
         where not exists (
           select 1 from public.project_assignments
            where project_id = $1 and team_member_id = $2
         )`,
        [project.id, memberId, role],
      ).catch(() => []);
    }

    const seedMilestones = body.seed_milestones !== false;
    if (seedMilestones) {
      const milestones = [
        "Discovery",
        "Strategy",
        "Concept Development",
        "Design Phase",
        "Review Phase",
        "Final Approval",
        "Delivery",
        "Project Closure",
      ];
      await glashQuery(
        `insert into public.finance_milestones (project_id, description, position, milestone_key, due_date)
         select $1, milestone_name, position, lower(replace(milestone_name, ' ', '_')), $2::date
           from unnest($3::text[]) with ordinality as seed(milestone_name, position)`,
        [project.id, cleanDate(body.client_delivery_date) || cleanDate(body.duration_end), milestones],
      );
    }

    await addActivity({
      projectId: project.id,
      session,
      action: "project.create",
      title: `Created project: ${project.name}`,
      body: project.client ? `Client: ${project.client}` : null,
      metadata: { category, priority, status },
    });
    if (assignmentRows.length) {
      await notifyMembers(project.id, assignmentRows.map(([id]) => id), `New project assigned: ${project.name}`, "Open the project workspace for tasks and milestones.", "project_assigned");
    }

    return NextResponse.json({ ok: true, project });
  }

  const projectId = cleanUuid(body.project_id);
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "project_id is required." }, { status: 400 });
  }
  const visible = await projectIsVisible(session, projectId);
  if (!visible) {
    return NextResponse.json({ ok: false, error: "Project not found or not assigned to you." }, { status: 404 });
  }

  if (action === "update_project") {
    if (!canEditProjects(session)) {
      return NextResponse.json({ ok: false, error: "You do not have permission to update projects." }, { status: 403 });
    }
    const status = body.status == null ? undefined : normalizeStatus(body.status, PROJECT_STATUSES, "active");
    const priority = body.priority == null ? undefined : normalizePriority(body.priority);
    const project = await glashOne<ProjectRow>(
      `update public.finance_projects
          set name = coalesce(nullif($2, ''), name),
              client = coalesce(nullif($3, ''), client),
              category = coalesce($4, category),
              description = coalesce($5, description),
              priority = coalesce($6, priority),
              status = coalesce($7, status),
              duration_start = coalesce($8, duration_start),
              duration_end = coalesce($9, duration_end),
              internal_deadline = coalesce($10, internal_deadline),
              client_delivery_date = coalesce($11, client_delivery_date),
              revision_deadline = coalesce($12, revision_deadline),
              launch_date = coalesce($13, launch_date),
              completion_date = coalesce($14, completion_date),
              updated_at = now()
        where id = $1
        returning *, null::text as project_manager_name, null::text as department_lead_name`,
      [
        projectId,
        cleanText(body.name),
        cleanText(body.client),
        nullableText(body.category),
        nullableText(body.description),
        priority ?? null,
        status ?? null,
        cleanDate(body.duration_start),
        cleanDate(body.duration_end),
        cleanDate(body.internal_deadline),
        cleanDate(body.client_delivery_date),
        cleanDate(body.revision_deadline),
        cleanDate(body.launch_date),
        cleanDate(body.completion_date),
      ],
    );
    await addActivity({ projectId, session, action: "project.update", title: `Updated project: ${project.name}` });
    return NextResponse.json({ ok: true, project });
  }

  if (action === "assign_project") {
    if (!canEditProjects(session)) {
      return NextResponse.json({ ok: false, error: "You do not have permission to assign project members." }, { status: 403 });
    }
    const memberId = cleanUuid(body.team_member_id);
    const department = nullableText(body.department);
    const role = nullableText(body.role) || "Contributor";
    if (!memberId && !department) {
      return NextResponse.json({ ok: false, error: "Choose a member or department." }, { status: 400 });
    }
    if (memberId && department) {
      return NextResponse.json({ ok: false, error: "Choose either member or department, not both." }, { status: 400 });
    }
    const duplicate = memberId
      ? await glashMaybeOne<{ id: string }>("select id from public.project_assignments where project_id = $1 and team_member_id = $2 limit 1", [projectId, memberId])
      : await glashMaybeOne<{ id: string }>("select id from public.project_assignments where project_id = $1 and lower(department) = lower($2) limit 1", [projectId, department]);
    if (duplicate) return NextResponse.json({ ok: false, error: "That assignment already exists." }, { status: 409 });

    const assignment = await glashOne<AssignmentRow>(
      `insert into public.project_assignments (project_id, team_member_id, department, role)
       values ($1,$2,$3,$4)
       returning *, null::text as member_name, null::text as member_email, null::text as member_role_title,
                 null::text as member_department, null::text as member_avatar_url`,
      [projectId, memberId, department, role],
    );
    const recipients = memberId ? [memberId] : await projectRecipients(projectId);
    await notifyMembers(projectId, recipients, "Project assignment updated", role ? `Role: ${role}` : "Open the project workspace.", "project_assigned");
    await addActivity({
      projectId,
      session,
      action: "project.assign",
      title: memberId ? "Assigned a team member" : `Assigned ${department} department`,
      body: role,
    });
    return NextResponse.json({ ok: true, assignment });
  }

  if (action === "create_task") {
    const title = cleanText(body.title);
    if (!title) return NextResponse.json({ ok: false, error: "Task title is required." }, { status: 400 });
    const status = normalizeStatus(body.status, TASK_STATUSES, "not_started");
    const priority = normalizeStatus(body.priority, TASK_PRIORITIES, "medium");
    const task = await glashOne<TaskRow>(
      `insert into public.project_tasks (
         project_id, milestone_id, title, description, assignee_id, reviewer_id,
         department, priority, status, progress, due_date, created_by_member_id, created_by_admin
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning *, null::text as assignee_name, null::text as reviewer_name`,
      [
        projectId,
        cleanUuid(body.milestone_id),
        title,
        nullableText(body.description),
        cleanUuid(body.assignee_id),
        cleanUuid(body.reviewer_id),
        nullableText(body.department),
        priority,
        status,
        Number(body.progress || 0),
        cleanDate(body.due_date),
        session.id,
        session.is_sub_admin,
      ],
    );
    if (task.assignee_id) {
      await notifyMembers(projectId, [task.assignee_id], `Task assigned: ${task.title}`, task.due_date ? `Due ${task.due_date}` : "Open the project workspace.", "task_assigned");
    }
    await addActivity({ projectId, session, action: "task.create", title: `Created task: ${task.title}`, metadata: { task_id: task.id } });
    return NextResponse.json({ ok: true, task });
  }

  if (action === "update_task") {
    const taskId = cleanUuid(body.task_id);
    if (!taskId) return NextResponse.json({ ok: false, error: "task_id is required." }, { status: 400 });
    const task = await glashMaybeOne<TaskRow>(
      `select t.*, assignee.full_name as assignee_name, reviewer.full_name as reviewer_name
         from public.project_tasks t
         left join public.team_members assignee on assignee.id = t.assignee_id
         left join public.team_members reviewer on reviewer.id = t.reviewer_id
        where t.id = $1 and t.project_id = $2
        limit 1`,
      [taskId, projectId],
    );
    if (!task) return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
    const canEditTask = canEditProjects(session) || task.assignee_id === session.id || task.reviewer_id === session.id;
    if (!canEditTask) return NextResponse.json({ ok: false, error: "You cannot update this task." }, { status: 403 });

    const nextStatus = body.status == null ? task.status : normalizeStatus(body.status, TASK_STATUSES, task.status);
    const nextTask = await glashOne<TaskRow>(
      `update public.project_tasks
          set title = coalesce(nullif($3, ''), title),
              description = coalesce($4, description),
              assignee_id = coalesce($5, assignee_id),
              reviewer_id = coalesce($6, reviewer_id),
              department = coalesce($7, department),
              priority = coalesce($8, priority),
              status = $9,
              progress = coalesce($10, progress),
              due_date = coalesce($11, due_date),
              completed_at = case when $9 in ('approved','completed') then coalesce(completed_at, now()) else completed_at end,
              updated_at = now()
        where id = $1 and project_id = $2
        returning *, null::text as assignee_name, null::text as reviewer_name`,
      [
        taskId,
        projectId,
        cleanText(body.title),
        nullableText(body.description),
        cleanUuid(body.assignee_id),
        cleanUuid(body.reviewer_id),
        nullableText(body.department),
        body.priority == null ? null : normalizeStatus(body.priority, TASK_PRIORITIES, task.priority),
        nextStatus,
        body.progress == null ? null : Number(body.progress),
        cleanDate(body.due_date),
      ],
    );
    await addActivity({ projectId, session, action: "task.update", title: `Updated task: ${nextTask.title}`, body: nextStatus });
    return NextResponse.json({ ok: true, task: nextTask });
  }

  if (action === "add_comment") {
    const taskId = cleanUuid(body.task_id);
    const bodyText = cleanText(body.body);
    if (!taskId || !bodyText) return NextResponse.json({ ok: false, error: "Task and comment are required." }, { status: 400 });
    const task = await glashMaybeOne<{ id: string; title: string; assignee_id: string | null }>(
      "select id, title, assignee_id from public.project_tasks where id = $1 and project_id = $2 limit 1",
      [taskId, projectId],
    );
    if (!task) return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
    const comment = await glashOne<{ id: string; body: string; created_at: string }>(
      `insert into public.project_task_comments (task_id, project_id, author_member_id, author_is_admin, body, internal_only)
       values ($1,$2,$3,$4,$5,$6)
       returning id, body, created_at`,
      [taskId, projectId, session.id, session.is_sub_admin, bodyText, body.internal_only !== false],
    );
    if (task.assignee_id && task.assignee_id !== session.id) {
      await notifyMembers(projectId, [task.assignee_id], `New comment on: ${task.title}`, bodyText.slice(0, 120), "task_comment");
    }
    await addActivity({ projectId, session, action: "task.comment", title: `Commented on task: ${task.title}`, metadata: { task_id: taskId } });
    return NextResponse.json({ ok: true, comment });
  }

  if (action === "add_document") {
    const title = cleanText(body.title);
    const fileUrl = cleanText(body.file_url);
    if (!title || !fileUrl) {
      return NextResponse.json({ ok: false, error: "Document title and file URL are required." }, { status: 400 });
    }
    const document = await glashOne<DocumentRow>(
      `insert into public.project_documents
        (project_id, kind, title, file_url, folder, description, visibility, added_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning id, project_id, kind, title, file_url, folder, description, visibility, created_at`,
      [
        projectId,
        nullableText(body.kind) || "link",
        title,
        fileUrl,
        nullableText(body.folder) || "Client Files",
        nullableText(body.description),
        nullableText(body.visibility) || "internal",
        session.full_name || session.username,
      ],
    );
    await addActivity({ projectId, session, action: "document.add", title: `Added document: ${document.title}`, body: document.folder });
    const recipients = await projectRecipients(projectId);
    await notifyMembers(projectId, recipients, `Project file added: ${document.title}`, document.folder || "Open the project workspace.", "project_file");
    return NextResponse.json({ ok: true, document });
  }

  if (action === "request_approval") {
    const approval = await glashOne<ApprovalRow>(
      `insert into public.project_approvals (
         project_id, task_id, milestone_id, requested_by_member_id, reviewer_member_id,
         client_name, approval_type, status, note
       )
       values ($1,$2,$3,$4,$5,$6,$7,'pending',$8)
       returning *, null::text as requested_by_name, null::text as reviewer_name`,
      [
        projectId,
        cleanUuid(body.task_id),
        cleanUuid(body.milestone_id),
        session.id,
        cleanUuid(body.reviewer_member_id),
        nullableText(body.client_name),
        nullableText(body.approval_type) || "internal_review",
        nullableText(body.note),
      ],
    );
    if (approval.reviewer_member_id) {
      await notifyMembers(projectId, [approval.reviewer_member_id], "Approval requested", approval.note || "Review the project item.", "approval_requested");
    }
    await addActivity({ projectId, session, action: "approval.request", title: "Requested approval", body: approval.approval_type });
    return NextResponse.json({ ok: true, approval });
  }

  if (action === "decide_approval") {
    const approvalId = cleanUuid(body.approval_id);
    if (!approvalId) return NextResponse.json({ ok: false, error: "approval_id is required." }, { status: 400 });
    const approval = await glashMaybeOne<{ reviewer_member_id: string | null; requested_by_member_id: string | null }>(
      "select reviewer_member_id, requested_by_member_id from public.project_approvals where id = $1 and project_id = $2 limit 1",
      [approvalId, projectId],
    );
    if (!approval) return NextResponse.json({ ok: false, error: "Approval not found." }, { status: 404 });
    if (!canEditProjects(session) && approval.reviewer_member_id !== session.id) {
      return NextResponse.json({ ok: false, error: "You cannot decide this approval." }, { status: 403 });
    }
    const status = normalizeStatus(body.status, new Set(["approved", "revision_requested", "rejected", "pending"]), "approved");
    const updated = await glashOne<ApprovalRow>(
      `update public.project_approvals
          set status = $3,
              decision_note = $4,
              decided_at = case when $3 = 'pending' then null else now() end
        where id = $1 and project_id = $2
        returning *, null::text as requested_by_name, null::text as reviewer_name`,
      [approvalId, projectId, status, nullableText(body.decision_note)],
    );
    if (approval.requested_by_member_id && approval.requested_by_member_id !== session.id) {
      await notifyMembers(projectId, [approval.requested_by_member_id], `Approval ${status.replace("_", " ")}`, updated.decision_note || "Open the project workspace.", "approval_decision");
    }
    await addActivity({ projectId, session, action: "approval.decide", title: `Approval ${status.replace("_", " ")}`, body: updated.decision_note });
    return NextResponse.json({ ok: true, approval: updated });
  }

  if (action === "ensure_project_chat") {
    const existing = await glashMaybeOne<{ id: string; name: string | null }>(
      "select id, name from public.team_chat_threads where project_id = $1 order by created_at desc limit 1",
      [projectId],
    );
    if (existing) return NextResponse.json({ ok: true, thread: existing, reused: true });
    const project = await glashOne<{ id: string; name: string }>("select id, name from public.finance_projects where id = $1", [projectId]);
    const thread = await glashOne<{ id: string; name: string | null }>(
      `insert into public.team_chat_threads (kind, name, project_id, created_by, includes_admin)
       values ('group', $1, $2, $3, true)
       returning id, name`,
      [`${project.name} - Project Chat`, projectId, session.id],
    );
    const recipients = await projectRecipients(projectId);
    const participantIds = Array.from(new Set([...recipients, session.id]));
    if (participantIds.length) {
      await glashQuery(
        `insert into public.team_chat_participants (thread_id, team_member_id)
         select $1, unnest($2::uuid[])
         on conflict do nothing`,
        [thread.id, participantIds],
      ).catch(() => []);
    }
    await addActivity({ projectId, session, action: "chat.create", title: "Created project chat" });
    return NextResponse.json({ ok: true, thread, participant_count: participantIds.length });
  }

  return NextResponse.json({ ok: false, error: "Unsupported project workspace action." }, { status: 400 });
}
