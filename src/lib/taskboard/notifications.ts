import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { notifySuperAdmin } from "@/lib/notify-admin";
import { notifyTaskboardMembers } from "@/lib/taskboard/server";

type TaskboardEvent = "created" | "completed";

interface TaskboardEventContext {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  list_id: string;
  list_title: string;
  board_title: string;
}

interface TaskboardRecipient {
  id: string;
  full_name: string | null;
  email: string | null;
  email_verified_at: string | null;
}

function taskLink(portal: "admin" | "team", boardId: string, taskId: string) {
  const path = portal === "admin" ? "/admin/taskboard" : "/team/taskboard";
  return `${path}?board_id=${encodeURIComponent(boardId)}&task_id=${encodeURIComponent(taskId)}`;
}

/**
 * Notify every direct list member and task assignee, plus the super-admin.
 * Delivery is best-effort so a failed notice never rolls back the task.
 */
export async function notifyTaskboardEvent(input: {
  event: TaskboardEvent;
  boardId: string;
  taskId: string;
  actorName: string;
  actorIsAdmin: boolean;
}) {
  try {
    const task = await glashMaybeOne<TaskboardEventContext>(
      `select t.id, t.title, t.priority, t.due_at, t.list_id,
              l.title as list_title, b.title as board_title
         from public.task_board_tasks t
         join public.task_board_lists l on l.id = t.list_id
         join public.task_boards b on b.id = t.board_id
        where t.id = $1 and t.board_id = $2
        limit 1`,
      [input.taskId, input.boardId],
    );
    if (!task) return;

    const recipients = await glashQuery<TaskboardRecipient>(
      `select distinct m.id, m.full_name, m.email, m.email_verified_at
         from public.team_members m
        where m.is_active = true
          and (
            exists (
              select 1
                from public.task_board_list_members lm
               where lm.list_id = $1 and lm.team_member_id = m.id
            )
            or exists (
              select 1
                from public.task_board_task_assignees a
               where a.task_id = $2 and a.team_member_id = m.id
            )
          )
        order by m.full_name`,
      [task.list_id, task.id],
    );

    const created = input.event === "created";
    const notificationTitle = created ? `New task: ${task.title}` : `Task completed: ${task.title}`;
    const notificationBody = created
      ? `${input.actorName} created a task in ${task.list_title}.`
      : `${input.actorName} completed a task in ${task.list_title}.`;

    await Promise.all([
      notifyTaskboardMembers({
        memberIds: recipients.map((recipient) => recipient.id),
        kind: created ? "task_created" : "task_completed",
        title: notificationTitle,
        body: notificationBody,
        boardId: input.boardId,
        taskId: input.taskId,
        actorIsAdmin: input.actorIsAdmin,
      }),
      notifySuperAdmin({
        type: "status_change",
        title: notificationTitle,
        message: `${notificationBody} Board: ${task.board_title}.`,
        link: taskLink("admin", input.boardId, input.taskId),
      }),
    ]);
    // Task events stay on the bell and push; they are no longer emailed.
  } catch (error) {
    console.error("[taskboard-notifications] delivery failed:", error);
  }
}
