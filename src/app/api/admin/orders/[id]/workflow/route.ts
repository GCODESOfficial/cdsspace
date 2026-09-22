import { NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { htmlToReadableText, richTextToSingleLine } from "@/lib/rich-text";
import { verifyAdmin } from "@/lib/admin-auth";
import { glashPool, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanIds(value: unknown) {
  return Array.isArray(value) ? Array.from(new Set(value.map(String).filter((id) => UUID.test(id)))).slice(0, 50) : [];
}

/**
 * The brief as text a person can read.
 *
 * This used to strip the tags and collapse every run of whitespace, which
 * turned a brief of headings and bullet lists into one unbroken paragraph in
 * the task notes. htmlToReadableText keeps the paragraphs and bullets; the
 * sanitiser still runs first so nothing but the allowed structure survives.
 */
function plainText(value: string) {
  return htmlToReadableText(sanitizeHtml(value, {
    allowedTags: ["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u"],
    allowedAttributes: {},
  }));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redact(value: string, sensitiveValues: Array<string | null | undefined>, singleLine = false) {
  // A brief keeps its lines; a title is one line by definition and must not
  // inherit the paragraph breaks now that the brief keeps them.
  let result = singleLine ? richTextToSingleLine(value) : plainText(value);
  for (const sensitive of sensitiveValues) {
    const token = String(sensitive || "").trim();
    if (token.length >= 3) result = result.replace(new RegExp(escapeRegExp(token), "gi"), "the client");
  }
  return result
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[client email removed]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[client phone removed]")
    .slice(0, 4000);
}

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [boards, members] = await Promise.all([
    glashQuery<{ id: string; title: string; lists: Array<{ id: string; title: string }> }>(
      `select b.id, b.title,
              coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title) order by l.position)
                filter (where l.id is not null), '[]'::jsonb) as lists
         from public.task_boards b
         left join public.task_board_lists l on l.board_id = b.id
        where b.archived_at is null
        group by b.id
        order by b.updated_at desc`,
    ),
    glashQuery<{ id: string; full_name: string; department: string | null; role_title: string | null }>(
      `select id, full_name, department, role_title from public.team_members where is_active = true order by full_name`,
    ),
  ]);
  return NextResponse.json({ boards, members });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const route = body.route === "project" ? "project" : "taskboard";
  const memberIds = cleanIds(body.member_ids);
  if (!memberIds.length) return NextResponse.json({ error: "Assign at least one team member." }, { status: 400 });

  const client = await glashPool.connect();
  try {
    await client.query("begin");
    const orderResult = await client.query<{
      id: string; user_id: string; display_id: string; title: string; description: string; category: string | null;
      workflow_type: string | null; full_name: string | null; company_name: string | null; email: string | null; phone: string | null;
    }>(
      `select r.id, r.user_id, r.display_id, r.title, r.description, r.category, r.workflow_type,
              p.full_name, p.company_name, p.email, p.phone_number as phone
         from public.design_requests r
         left join public.profiles p on p.id = r.user_id
        where r.id = $1
        for update of r`,
      [id],
    );
    const order = orderResult.rows[0];
    if (!order) throw Object.assign(new Error("Design order not found."), { status: 404 });
    if (order.workflow_type) throw Object.assign(new Error("This order has already been routed into production."), { status: 409 });

    const activeMembers = await client.query<{ id: string }>(
      "select id from public.team_members where id = any($1::uuid[]) and is_active = true",
      [memberIds],
    );
    if (activeMembers.rows.length !== memberIds.length) throw Object.assign(new Error("One of the selected team members is no longer active."), { status: 409 });

    const sensitive = [order.full_name, order.company_name, order.email, order.phone];
    const teamTitle = redact(clean(body.team_title, 180) || `Design production ${order.display_id}`, sensitive, true) || `Design production ${order.display_id}`;
    const teamBrief = redact(clean(body.team_brief, 4000) || order.description, sensitive);
    const leadId = memberIds[0];
    const deliveryResult = await client.query<{ id: string }>(
      `insert into public.client_deliveries
         (delivery_type, title, description, status, client_user_id, assigned_team_lead_id,
          created_by, assigned_by, source_design_request_id)
       values ('design',$1,$2,'assigned',$3,$4,$5,$5,$6)
       returning id`,
      [teamTitle, teamBrief || null, order.user_id, leadId, admin.email, order.id],
    );
    const deliveryId = deliveryResult.rows[0].id;
    let taskId: string | null = null;
    let projectId: string | null = null;

    if (route === "taskboard") {
      const boardId = clean(body.board_id, 40);
      const listId = clean(body.list_id, 40);
      const listResult = await client.query<{ id: string }>(
        "select id from public.task_board_lists where id = $1 and board_id = $2 limit 1",
        [listId, boardId],
      );
      if (!listResult.rows[0]) throw Object.assign(new Error("Choose a valid taskboard list."), { status: 400 });
      const taskResult = await client.query<{ id: string }>(
        `insert into public.task_board_tasks
          (board_id, list_id, title, notes, priority, position, created_by_kind, created_by_id, created_by_name, source_type, source_id)
         values ($1,$2,$3,$4,'high',coalesce((select max(position)+1000 from public.task_board_tasks where list_id=$2),1000),
                 'admin',$5,$5,'design_request',$6)
         returning id`,
        [boardId, listId, teamTitle, teamBrief || null, admin.email, order.id],
      );
      taskId = taskResult.rows[0].id;
      await client.query(
        `insert into public.task_board_members(board_id, team_member_id, role, added_by_id)
         select $1, id, 'editor', $3 from public.team_members where id = any($2::uuid[])
         on conflict(board_id, team_member_id) do nothing`,
        [boardId, memberIds, admin.email],
      );
      await client.query(
        `insert into public.task_board_task_assignees(task_id, team_member_id, assigned_by_id)
         select $1, id, $3 from public.team_members where id = any($2::uuid[])
         on conflict(task_id, team_member_id) do nothing`,
        [taskId, memberIds, admin.email],
      );
    } else {
      const projectResult = await client.query<{ id: string }>(
        `insert into public.finance_projects
          (name, client, currency, status, category, description, notes, priority,
           project_manager_id, department_lead_id, source_design_request_id)
         values ($1,$2,'NGN','active','Design',$3,$3,'high',$4,$4,$5)
         returning id`,
        [teamTitle, `Internal order ${order.display_id}`, teamBrief || null, leadId, order.id],
      );
      projectId = projectResult.rows[0].id;
      await client.query("update public.client_deliveries set project_id = $2 where id = $1", [deliveryId, projectId]);
      await client.query(
        `insert into public.project_assignments
          (project_id, team_member_id, role, is_project_leader, can_edit_project, can_manage_tasks)
         select $1, id, case when id=$3 then 'Project lead' else 'Designer' end,
                id=$3, id=$3, id=$3
           from public.team_members where id = any($2::uuid[])
         on conflict(project_id, team_member_id) where team_member_id is not null do nothing`,
        [projectId, memberIds, leadId],
      );
      const taskResult = await client.query<{ id: string }>(
        `insert into public.project_tasks
          (project_id, title, description, assignee_id, priority, status, created_by_admin)
         values ($1,$2,$3,$4,'high','not_started',true)
         returning id`,
        [projectId, teamTitle, teamBrief || null, leadId],
      );
      taskId = taskResult.rows[0].id;
    }

    await client.query(
      `update public.design_requests
          set workflow_type=$2, workflow_status='assigned', team_title=$3, team_brief=$4,
              task_id=$5, project_id=$6, delivery_id=$7, routed_at=now(), status='ACTIVE', updated_at=now()
        where id=$1`,
      [order.id, route, teamTitle, teamBrief || null, taskId, projectId, deliveryId],
    );
    await client.query(
      `insert into public.team_notifications(recipient_id, kind, title, body, link, actor_is_admin)
       select id, 'task_assigned', 'New design work assigned', $2, '/team/deliveries', true
         from public.team_members where id = any($1::uuid[])`,
      [memberIds, `${order.display_id} is ready in Delivery drafts.`],
    );
    await client.query("commit");

    return NextResponse.json({ ok: true, route, task_id: taskId, project_id: projectId, delivery_id: deliveryId });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const status = Number((error as { status?: number })?.status || 500);
    const message = error instanceof Error ? error.message : "Could not route this order.";
    console.error("[design order workflow]", message);
    return NextResponse.json({ error: status < 500 ? message : "Could not route this order." }, { status });
  } finally {
    client.release();
  }
}
