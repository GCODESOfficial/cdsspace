import "server-only";

import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { getTeamSession, type TeamSession } from "@/lib/team-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

export type TaskboardPortal = "admin" | "team";

export interface TaskboardViewer {
  portal: TaskboardPortal;
  kind: "admin" | "team";
  id: string;
  name: string;
  memberId: string | null;
  isSuperAdmin: boolean;
  canManageAll: boolean;
  admin: AdminSession | null;
  team: TeamSession | null;
}

export async function getTaskboardViewer(portal: TaskboardPortal): Promise<TaskboardViewer | null> {
  if (portal === "team") {
    const team = await getTeamSession();
    if (!team) return null;
    return {
      portal,
      kind: "team",
      id: team.id,
      name: team.full_name,
      memberId: team.id,
      isSuperAdmin: false,
      canManageAll: false,
      admin: null,
      team,
    };
  }

  const admin = await getAdminSession();
  if (!admin) return null;
  const allowed = admin.role === "super_admin"
    || hasPermission(admin.permissions, "team_today")
    || hasPermission(admin.permissions, "team_members");
  if (!allowed) return null;
  return {
    portal,
    kind: "admin",
    id: admin.memberId || admin.email,
    name: admin.name || admin.email,
    memberId: admin.memberId || null,
    isSuperAdmin: admin.role === "super_admin",
    canManageAll: admin.role === "super_admin",
    admin,
    team: null,
  };
}

export async function getBoardRole(viewer: TaskboardViewer, boardId: string) {
  if (viewer.isSuperAdmin) return "owner" as const;
  const board = await glashMaybeOne<{ created_by_kind: "admin" | "team"; created_by_id: string | null }>(
    `select created_by_kind, created_by_id
       from public.task_boards
      where id = $1
      limit 1`,
    [boardId],
  );
  if (
    board
    && board.created_by_kind === viewer.kind
    && board.created_by_id === viewer.id
  ) return "owner" as const;
  if (!viewer.memberId) return null;
  const row = await glashMaybeOne<{ role: "owner" | "editor" | "viewer" }>(
    `select role
       from public.task_board_members
      where board_id = $1 and team_member_id = $2
      limit 1`,
    [boardId, viewer.memberId],
  );
  return row?.role || null;
}

export async function canViewBoard(viewer: TaskboardViewer, boardId: string) {
  if (viewer.isSuperAdmin || !!(await getBoardRole(viewer, boardId))) return true;
  if (!viewer.memberId) return false;
  const assigned = await glashMaybeOne<{ found: boolean }>(
    `select true as found
       from public.task_board_tasks t
      where t.board_id = $1
        and (
          (t.created_by_kind = $2 and t.created_by_id = $3)
          or exists (
            select 1
              from public.task_board_task_assignees a
             where a.task_id = t.id and a.team_member_id = $4::uuid
          )
        )
      limit 1`,
    [boardId, viewer.kind, viewer.id, viewer.memberId],
  );
  return !!assigned;
}

export async function canEditBoard(viewer: TaskboardViewer, boardId: string) {
  if (viewer.isSuperAdmin) return true;
  const role = await getBoardRole(viewer, boardId);
  return role === "owner" || role === "editor";
}

export async function canManageBoard(viewer: TaskboardViewer, boardId: string) {
  if (viewer.isSuperAdmin) return true;
  return (await getBoardRole(viewer, boardId)) === "owner";
}

export async function canViewAllBoardTasks(viewer: TaskboardViewer, boardId: string) {
  if (viewer.isSuperAdmin) return true;
  const board = await glashMaybeOne<{ created_by_kind: "admin" | "team"; created_by_id: string | null }>(
    `select created_by_kind, created_by_id
       from public.task_boards
      where id = $1
      limit 1`,
    [boardId],
  );
  return !!board
    && board.created_by_kind === viewer.kind
    && board.created_by_id === viewer.id;
}

export async function requireTaskAccess(viewer: TaskboardViewer, taskId: string) {
  const task = await glashMaybeOne<{
    id: string;
    board_id: string;
    list_id: string;
    title: string;
    completed_at: string | null;
  }>(
    `select t.id, t.board_id, t.list_id, t.title, t.completed_at
       from public.task_board_tasks t
       join public.task_boards b on b.id = t.board_id
      where t.id = $1
        and (
          $2::boolean
          or (b.created_by_kind = $3 and b.created_by_id = $4)
          or (t.created_by_kind = $3 and t.created_by_id = $4)
          or (
            $5::uuid is not null
            and (
              exists (
                select 1
                  from public.task_board_task_assignees a
                 where a.task_id = t.id and a.team_member_id = $5::uuid
              )
              or exists (
                select 1
                  from public.task_board_list_members lm
                 where lm.list_id = t.list_id and lm.team_member_id = $5::uuid
              )
            )
          )
        )
      limit 1`,
    [taskId, viewer.isSuperAdmin, viewer.kind, viewer.id, viewer.memberId],
  );
  return task || null;
}

export async function logTaskboardActivity(
  viewer: TaskboardViewer,
  input: {
    boardId: string;
    taskId?: string | null;
    eventType: string;
    detail?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await glashQuery(
    `insert into public.task_board_activity
      (board_id, task_id, actor_kind, actor_id, actor_name, event_type, detail, metadata)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      input.boardId,
      input.taskId || null,
      viewer.kind,
      viewer.id,
      viewer.name,
      input.eventType,
      input.detail || null,
      JSON.stringify(input.metadata || {}),
    ],
  ).catch(() => []);
}

export async function notifyTaskboardMembers(input: {
  memberIds: string[];
  kind?: string;
  title: string;
  body: string;
  boardId?: string | null;
  taskId?: string | null;
  actorIsAdmin?: boolean;
}) {
  const ids = Array.from(new Set(input.memberIds.filter(Boolean)));
  if (!ids.length) return;
  await glashQuery(
    `insert into public.team_notifications
      (recipient_id, kind, title, body, link, actor_is_admin)
     select id, $2, $3, $4, $5, $6
       from public.team_members
      where id = any($1::uuid[])`,
    [
      ids,
      input.kind || "task_assigned",
      input.title,
      input.body,
      `/team/taskboard${input.boardId ? `?board_id=${encodeURIComponent(input.boardId)}${input.taskId ? `&task_id=${encodeURIComponent(input.taskId)}` : ""}` : ""}`,
      input.actorIsAdmin ?? true,
    ],
  ).catch(() => []);
}

export async function listAccessibleBoardIds(viewer: TaskboardViewer) {
  if (viewer.isSuperAdmin) {
    return glashQuery<{ id: string }>(
      `select id from public.task_boards where archived_at is null order by updated_at desc, created_at desc`,
    );
  }
  return glashQuery<{ id: string }>(
    `select b.id
       from public.task_boards b
      where b.archived_at is null
        and (
          (b.created_by_kind = $1 and b.created_by_id = $2)
          or (
            $3::uuid is not null
            and exists (
              select 1
                from public.task_board_members bm
               where bm.board_id = b.id and bm.team_member_id = $3::uuid
            )
          )
          or exists (
            select 1
              from public.task_board_tasks t
             where t.board_id = b.id
               and (
                 (t.created_by_kind = $1 and t.created_by_id = $2)
                 or (
                   $3::uuid is not null
                   and exists (
                     select 1
                       from public.task_board_task_assignees a
                      where a.task_id = t.id and a.team_member_id = $3::uuid
                   )
                 )
               )
          )
        )
      order by b.updated_at desc, b.created_at desc`,
    [viewer.kind, viewer.id, viewer.memberId],
  );
}
