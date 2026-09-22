import { NextResponse } from "next/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getTaskboardViewer, type TaskboardPortal } from "@/lib/taskboard/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Opens a delivery draft for a taskboard task.
 *
 * Work that starts on the board had no way into the delivery flow: only a
 * routed client order could raise one, so finished files were being passed
 * around outside the review and approval the flow exists to provide. The draft
 * created here carries no client - an admin attaches one before sharing, which
 * is what lets a team open a draft for work that has no client yet.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const portal: TaskboardPortal = body?.portal === "admin" ? "admin" : "team";
  const viewer = await getTaskboardViewer(portal);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const taskId = String(body?.task_id || "");
  if (!UUID.test(taskId)) return NextResponse.json({ error: "Task is invalid." }, { status: 400 });

  const task = await glashMaybeOne<{
    id: string;
    title: string;
    notes: string | null;
    source_type: string | null;
    source_id: string | null;
    board_created_by_kind: string | null;
    board_created_by_id: string | null;
  }>(
    `select t.id, t.title, t.notes, t.source_type, t.source_id,
            b.created_by_kind as board_created_by_kind, b.created_by_id as board_created_by_id
       from public.task_board_tasks t
       join public.task_boards b on b.id = t.board_id
      where t.id = $1`,
    [taskId],
  );
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  // Anyone who can act on the task can raise its delivery: the people doing the
  // work, and the admins who own the board.
  const assigned = viewer.memberId
    ? await glashMaybeOne<{ task_id: string }>(
      `select task_id from public.task_board_task_assignees where task_id = $1 and team_member_id = $2`,
      [taskId, viewer.memberId],
    )
    : null;
  const ownsBoard = viewer.isSuperAdmin
    || (viewer.kind === "admin" && task.board_created_by_kind === "admin")
    || (task.board_created_by_kind === viewer.kind && task.board_created_by_id === viewer.id);
  if (!assigned && !ownsBoard) {
    return NextResponse.json({ error: "Only someone assigned to this task can open its delivery." }, { status: 403 });
  }

  // A second press returns the draft that already exists rather than opening a
  // rival one the first uploader would never see.
  const existing = await glashMaybeOne<{ id: string; status: string }>(
    `select id, status from public.client_deliveries where source_task_id = $1`,
    [taskId],
  );
  if (existing) {
    return NextResponse.json({ ok: true, delivery_id: existing.id, status: existing.status, existing: true });
  }

  // A task routed from a client order already knows whose work it is, so the
  // client and the originating request are carried across.
  const order = task.source_type === "design_request" && task.source_id && UUID.test(task.source_id)
    ? await glashMaybeOne<{ id: string; user_id: string | null }>(
      `select id, user_id from public.design_requests where id = $1`,
      [task.source_id],
    )
    : null;

  const created = await glashQuery<{ id: string; status: string }>(
    `insert into public.client_deliveries
       (delivery_type, title, description, status, created_by,
        assigned_team_lead_id, client_user_id, source_design_request_id, source_task_id)
     values ('design', $1, $2, 'draft', $3, $4, $5, $6, $7)
     returning id, status`,
    [
      task.title.slice(0, 180),
      task.notes || null,
      viewer.name,
      viewer.memberId,
      order?.user_id || null,
      order?.id || null,
      taskId,
    ],
  );

  return NextResponse.json({ ok: true, delivery_id: created[0].id, status: created[0].status, existing: false }, { status: 201 });
}
