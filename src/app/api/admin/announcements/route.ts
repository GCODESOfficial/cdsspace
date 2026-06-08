import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Audience = "clients" | "team" | "project";
type ClientMode = "all" | "selected";
type TeamMode = "all" | "selected" | "department";

function canSendAnnouncements(session: Awaited<ReturnType<typeof getAdminSession>>) {
  if (!session) return false;
  return session.role === "super_admin" || hasPermission(session.permissions || [], "team_chat.broadcast");
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanUuidList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item)),
    ),
  );
}

async function projectTeamRecipients(projectId: string) {
  return glashQuery<{ id: string }>(
     `with direct_members as (
       select pa.team_member_id as id
         from public.project_assignments pa
         join public.team_members m
           on m.id = pa.team_member_id
          and m.is_active = true
        where pa.project_id = $1
          and pa.team_member_id is not null
     ),
     department_members as (
       select m.id
         from public.project_assignments pa
         join public.team_members m
           on lower(m.department) = lower(pa.department)
          and m.is_active = true
        where pa.project_id = $1
          and pa.department is not null
     )
     select distinct id
       from (
         select id from direct_members
         union all
         select id from department_members
       ) recipients
      where id is not null`,
    [projectId],
  );
}

export async function GET() {
  const session = await getAdminSession();
  if (!canSendAnnouncements(session)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const [clients, teamMembers, departments, projects] = await Promise.all([
    glashQuery<{ id: string; full_name: string | null; email: string | null }>(
      `select id, full_name, email
         from public.profiles
        where coalesce(lower(email), '') <> 'ceo@cdsspace.pro'
        order by coalesce(full_name, email) asc`,
    ),
    glashQuery<{ id: string; full_name: string; username: string; department: string | null; role_title: string | null; avatar_url: string | null }>(
      `select id, full_name, username, department, role_title, avatar_url
         from public.team_members
        where is_active = true
        order by full_name asc`,
    ),
    glashQuery<{ department: string }>(
      `select distinct department
         from public.team_members
        where is_active = true
          and nullif(trim(department), '') is not null
        order by department asc`,
    ),
    glashQuery<{ id: string; name: string; client: string | null }>(
      `select id, name, client
         from public.finance_projects
        order by created_at desc`,
    ),
  ]);

  return NextResponse.json({
    ok: true,
    clients,
    teamMembers,
    departments: departments.map((row) => row.department),
    projects,
  });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!canSendAnnouncements(session)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const audience = cleanText(body.audience) as Audience;
  const title = cleanText(body.title);
  const message = cleanText(body.message);
  const link = cleanText(body.link) || null;

  if (!["clients", "team", "project"].includes(audience)) {
    return NextResponse.json({ ok: false, error: "Choose a valid audience." }, { status: 400 });
  }
  if (title.length < 3) {
    return NextResponse.json({ ok: false, error: "Announcement title is required." }, { status: 400 });
  }
  if (message.length < 3) {
    return NextResponse.json({ ok: false, error: "Announcement message is required." }, { status: 400 });
  }

  let recipientIds: string[] = [];
  let targetLabel = "";

  if (audience === "clients") {
    const mode = cleanText(body.clientMode) as ClientMode;
    if (mode === "selected") {
      recipientIds = cleanUuidList(body.clientIds);
    } else {
      const rows = await glashQuery<{ id: string }>(
        `select id
           from public.profiles
          where coalesce(lower(email), '') <> 'ceo@cdsspace.pro'
          order by created_at desc`,
      );
      recipientIds = rows.map((row) => row.id);
    }
    if (recipientIds.length === 0) {
      return NextResponse.json({ ok: false, error: "No client recipients found." }, { status: 400 });
    }
    await glashQuery(
      `insert into public.notifications (user_id, type, title, message, link)
       select unnest($1::uuid[]), 'status_change', $2, $3, $4`,
      [recipientIds, title, message, link || "/dashboard"],
    );
    targetLabel = mode === "selected" ? `${recipientIds.length} selected clients` : "All clients";
  }

  if (audience === "team") {
    const mode = cleanText(body.teamMode) as TeamMode;
    if (mode === "selected") {
      recipientIds = cleanUuidList(body.teamMemberIds);
    } else if (mode === "department") {
      const department = cleanText(body.department);
      if (!department) {
        return NextResponse.json({ ok: false, error: "Choose a department." }, { status: 400 });
      }
      const rows = await glashQuery<{ id: string }>(
        `select id from public.team_members
          where is_active = true
            and lower(department) = lower($1)`,
        [department],
      );
      recipientIds = rows.map((row) => row.id);
      targetLabel = `${department} department`;
    } else {
      const rows = await glashQuery<{ id: string }>(
        "select id from public.team_members where is_active = true order by full_name asc",
      );
      recipientIds = rows.map((row) => row.id);
      targetLabel = "All team members";
    }
    if (recipientIds.length === 0) {
      return NextResponse.json({ ok: false, error: "No team recipients found." }, { status: 400 });
    }
    await glashQuery(
      `insert into public.team_notifications (recipient_id, kind, title, body, link, actor_is_admin)
       select unnest($1::uuid[]), 'announcement', $2, $3, $4, true`,
      [recipientIds, title, message, link || "/team"],
    );
    if (!targetLabel) targetLabel = `${recipientIds.length} selected team members`;
  }

  if (audience === "project") {
    const projectId = cleanText(body.projectId);
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Choose a project." }, { status: 400 });
    }
    const [project] = await glashQuery<{ id: string; name: string }>(
      "select id, name from public.finance_projects where id = $1 limit 1",
      [projectId],
    );
    if (!project) {
      return NextResponse.json({ ok: false, error: "Project was not found." }, { status: 404 });
    }
    const rows = await projectTeamRecipients(projectId);
    recipientIds = rows.map((row) => row.id);
    if (recipientIds.length === 0) {
      return NextResponse.json({ ok: false, error: "This project has no assigned team recipients." }, { status: 400 });
    }
    await glashQuery(
      `insert into public.team_notifications (recipient_id, kind, title, body, link, actor_is_admin)
       select unnest($1::uuid[]), 'project_announcement', $2, $3, $4, true`,
      [recipientIds, title, message, link || `/team/work?project=${project.id}`],
    );
    targetLabel = `Project team: ${project.name}`;
  }

  await logActivity({
    action: "announcement.send",
    page: "announcements",
    resource_type: "announcement",
    resource_label: `${title} → ${targetLabel}`,
    metadata: {
      audience,
      recipient_count: recipientIds.length,
      link,
    },
  });

  return NextResponse.json({
    ok: true,
    recipient_count: recipientIds.length,
    target_label: targetLabel,
  });
}
