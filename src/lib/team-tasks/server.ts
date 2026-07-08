import "server-only";
import { glashOne, glashQuery } from "@/lib/glashdb/postgres";

export const TASK_STATUSES = [
    "not_started", "in_progress", "under_review", "needs_revision", "approved", "completed", "delayed",
] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export interface AssignArgs {
    assigneeId: string;
    title: string;
    description?: string | null;
    dueDate?: string | null;      // 'YYYY-MM-DD'
    priority?: string | null;
    /** Optional reference: uploaded file URL or a pasted image/file link. */
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    /** Assigning team member (lead); null for admin. */
    byMemberId?: string | null;
    byAdmin?: boolean;
    byName?: string;
}

/**
 * Create a direct (non-project) task assigned to a member and notify them.
 * Reuses the existing `project_tasks` engine with project_id NULL + origin='direct'.
 */
export async function assignDirectTask(args: AssignArgs) {
    const priority = (TASK_PRIORITIES as readonly string[]).includes(args.priority ?? "")
        ? args.priority
        : "medium";
    const attachmentUrl = args.attachmentUrl?.trim() || null;
    const attachmentName = args.attachmentName?.trim() || null;

    const baseCols = "project_id, title, description, assignee_id, priority, status, progress, due_date, created_by_member_id, created_by_admin, assigned_by_member_id, origin";
    const baseVals = "null, $1, $2, $3, $4, 'not_started', 0, $5, $6, $7, $6, 'direct'";
    const baseParams = [args.title, args.description ?? null, args.assigneeId, priority, args.dueDate || null, args.byMemberId ?? null, !!args.byAdmin];

    let task: any;
    try {
        task = attachmentUrl
            ? await glashOne<any>(
                `insert into public.project_tasks (${baseCols}, attachment_url, attachment_name)
                 values (${baseVals}, $8, $9) returning *`,
                [...baseParams, attachmentUrl, attachmentName],
            )
            : await glashOne<any>(
                `insert into public.project_tasks (${baseCols}) values (${baseVals}) returning *`,
                baseParams,
            );
    } catch (e) {
        // If the attachment columns aren't migrated yet, still create the task
        // (without the attachment) rather than failing the whole assignment.
        const msg = e instanceof Error ? e.message : "";
        if (attachmentUrl && /attachment_url|attachment_name|column .* does not exist/i.test(msg)) {
            task = await glashOne<any>(
                `insert into public.project_tasks (${baseCols}) values (${baseVals}) returning *`,
                baseParams,
            );
        } else {
            throw e;
        }
    }
    await glashQuery(
        `insert into public.team_notifications (recipient_id, kind, title, body, link, actor_is_admin)
         values ($1, 'task_assigned', $2, $3, '/team/my-day', $4)`,
        [
            args.assigneeId,
            `New task: ${args.title}`,
            args.byName ? `Assigned by ${args.byName}${args.dueDate ? ` · due ${args.dueDate}` : ""}` : "You have a new task.",
            !!args.byAdmin,
        ],
    ).catch((err) => {
        console.error(`[team-tasks] task ${task?.id} created but assignee notification failed:`, err instanceof Error ? err.message : err);
        return [];
    });
    return task;
}

export interface MemberRow {
    id: string;
    full_name: string;
    role_title: string | null;
    department: string | null;
    avatar_url: string | null;
}

/**
 * Members a lead/admin may assign to. Admins see everyone; a lead sees everyone
 * who shares AT LEAST ONE department with them (many-to-many via
 * team_member_departments), falling back to the legacy single-department name
 * match so it still works if the junction migration isn't applied.
 */
export async function assignableMembers(opts: { memberId?: string | null; department?: string | null; all: boolean }): Promise<MemberRow[]> {
    if (opts.all) {
        return glashQuery<MemberRow>(
            `select id, full_name, role_title, department, avatar_url
               from public.team_members where is_active order by full_name`,
        );
    }
    try {
        return await glashQuery<MemberRow>(
            `select distinct m.id, m.full_name, m.role_title, m.department, m.avatar_url
               from public.team_members m
              where m.is_active
                and (
                  exists (
                    select 1 from public.team_member_departments tmd
                     where tmd.team_member_id = m.id
                       and tmd.department_id in (
                         select department_id from public.team_member_departments where team_member_id = $1::uuid
                       )
                  )
                  or (m.department is not null and lower(m.department) = lower(coalesce($2::text, '')))
                )
              order by m.full_name`,
            [opts.memberId ?? null, opts.department ?? ""],
        );
    } catch {
        return glashQuery<MemberRow>(
            `select id, full_name, role_title, department, avatar_url
               from public.team_members where is_active and department = $1 order by full_name`,
            [opts.department ?? ""],
        );
    }
}
