import "server-only";

import { brandedEmailHtml } from "@/lib/email-template";
import { createEmailTransport, sendEmail } from "@/lib/email-from";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { notifySuperAdmin } from "@/lib/notify-admin";
import { notifyTaskboardMembers } from "@/lib/taskboard/server";

const SUPER_ADMIN_EMAIL = "contact.cdsspace@gmail.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://cdsspace.pro";

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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validEmail(value: string | null | undefined) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function formatDueDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });
}

function taskLink(portal: "admin" | "team", boardId: string, taskId: string) {
  const path = portal === "admin" ? "/admin/taskboard" : "/team/taskboard";
  return `${path}?board_id=${encodeURIComponent(boardId)}&task_id=${encodeURIComponent(taskId)}`;
}

function taskEmailHtml(input: {
  event: TaskboardEvent;
  recipientName: string;
  actorName: string;
  task: TaskboardEventContext;
  link: string;
}) {
  const created = input.event === "created";
  const due = formatDueDate(input.task.due_at);
  const action = created ? "created a new task" : "marked a task as completed";
  const state = created ? "New task" : "Task completed";
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #E8EDF5;color:#69738D;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #E8EDF5;color:#0D1B39;font-size:13px;font-weight:700;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;

  return brandedEmailHtml(
    `<h1 style="margin:0 0 14px;color:#0D1B39;font-size:24px;line-height:1.25;">${state}</h1>
     <p style="margin:0 0 16px;">Hello ${escapeHtml(input.recipientName)},</p>
     <p style="margin:0 0 18px;"><strong>${escapeHtml(input.actorName)}</strong> ${action} in CDS Space Taskboard.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #E8EDF5;border-radius:12px;border-collapse:separate;border-spacing:0;overflow:hidden;background:#F8FAFD;">
       ${row("Task", input.task.title)}
       ${row("List", input.task.list_title)}
       ${row("Board", input.task.board_title)}
       ${row("Priority", input.task.priority.charAt(0).toUpperCase() + input.task.priority.slice(1))}
       ${due ? row("Due", due) : ""}
     </table>
     <a href="${escapeHtml(input.link)}" style="display:inline-block;border-radius:10px;background:#0A4FE8;padding:12px 20px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;">Open task</a>
     <p style="margin:22px 0 0;color:#69738D;font-size:12px;line-height:1.6;">You are receiving this update because you are on the task list, assigned to the task, or administer CDS Space.</p>`,
    {
      eyebrow: "Taskboard",
      preheader: escapeHtml(`${state}: ${input.task.title}`),
    },
  );
}

/**
 * Notify every direct list member and task assignee, plus the super-admin.
 * Delivery is best-effort so a temporary mail outage never rolls back the task.
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

    const emailRecipients = new Map<string, { name: string; portal: "admin" | "team" }>();
    emailRecipients.set(SUPER_ADMIN_EMAIL, { name: "CDS Space Admin", portal: "admin" });
    for (const recipient of recipients) {
      if (!recipient.email_verified_at) continue;
      const email = validEmail(recipient.email);
      if (email && !emailRecipients.has(email)) {
        emailRecipients.set(email, { name: recipient.full_name || "team member", portal: "team" });
      }
    }

    const transporter = createEmailTransport();
    try {
      const subject = created
        ? `New task: ${task.title}`
        : `Task completed: ${task.title}`;
      const results = await Promise.allSettled(
        Array.from(emailRecipients.entries()).map(([email, recipient]) => {
          const relativeLink = taskLink(recipient.portal, input.boardId, input.taskId);
          const absoluteLink = `${SITE_URL}${relativeLink}`;
          return sendEmail({
            to: email,
            subject,
            text: `${notificationTitle}\n${notificationBody}\n${absoluteLink}`,
            html: taskEmailHtml({
              event: input.event,
              recipientName: recipient.name,
              actorName: input.actorName,
              task,
              link: absoluteLink,
            }),
            transporter,
            // Compound task-flood emails into a single digest per recipient.
            digestCategory: "tasks",
          });
        }),
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed > 0) {
        console.error(`[taskboard-notifications] ${failed} task email delivery attempt(s) failed.`);
      }
    } finally {
      transporter.close();
    }
  } catch (error) {
    console.error("[taskboard-notifications] delivery failed:", error);
  }
}
