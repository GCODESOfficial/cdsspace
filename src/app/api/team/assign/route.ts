/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getTeamSession } from "@/lib/team-auth";
import { assignDirectTask, assignableMembers } from "@/lib/team-tasks/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Load the acting member's lead/admin status + department. */
async function actor(memberId: string) {
    return glashMaybeOne<{ is_sub_admin: boolean; is_team_lead: boolean; department: string | null }>(
        `select is_sub_admin, coalesce(is_team_lead,false) as is_team_lead, department
           from public.team_members where id = $1`,
        [memberId],
    );
}

export async function GET() {
    const session = await getTeamSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = await actor(session.id).catch(() => null);
    if (!me || (!me.is_sub_admin && !me.is_team_lead)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const members = await assignableMembers({ memberId: session.id, department: me.department, all: me.is_sub_admin }).catch(() => []);
    const assigned = await glashQuery<any>(
        `select t.id, t.title, t.status, t.priority, t.due_date, t.created_at,
                m.full_name as assignee_name
           from public.project_tasks t
           left join public.team_members m on m.id = t.assignee_id
          where t.assigned_by_member_id = $1 and t.origin = 'direct'
          order by t.created_at desc limit 50`,
        [session.id],
    ).catch(() => []);
    return NextResponse.json({
        scope: me.is_sub_admin ? "all" : `department:${me.department ?? ""}`,
        members,
        assigned,
    });
}

export async function POST(req: NextRequest) {
    const session = await getTeamSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = await actor(session.id).catch(() => null);
    if (!me || (!me.is_sub_admin && !me.is_team_lead)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const title = String(body.title || "").trim();
    // Accept a list of assignees; keep back-compat with a single `assignee_id`.
    const rawIds: string[] = Array.isArray(body.assignee_ids)
        ? body.assignee_ids.map((x: any) => String(x || "")).filter(Boolean)
        : body.assignee_id
            ? [String(body.assignee_id)]
            : [];
    const assigneeIds = Array.from(new Set(rawIds));
    if (!title || assigneeIds.length === 0) {
        return NextResponse.json({ error: "At least one assignee and a title are required" }, { status: 400 });
    }

    // Leads may only assign to members who share at least one of their
    // departments (many-to-many), falling back to the legacy primary-department
    // name match. Validate every target.
    if (!me.is_sub_admin) {
        let allowedIds: string[];
        try {
            const rows = await glashQuery<{ id: string }>(
                `select m.id from public.team_members m
                  where m.id = any($1::uuid[])
                    and (
                      exists (
                        select 1 from public.team_member_departments tmd
                         where tmd.team_member_id = m.id
                           and tmd.department_id in (
                             select department_id from public.team_member_departments where team_member_id = $2::uuid
                           )
                      )
                      or (m.department is not null and lower(m.department) = lower(coalesce($3::text, '')))
                    )`,
                [assigneeIds, session.id, me.department ?? ""],
            );
            allowedIds = rows.map((r) => r.id);
        } catch {
            const targets = await glashQuery<{ id: string; department: string | null }>(
                `select id, department from public.team_members where id = any($1::uuid[])`,
                [assigneeIds],
            );
            allowedIds = targets.filter((t) => t.department === me.department).map((t) => t.id);
        }
        const allowed = new Set(allowedIds);
        if (assigneeIds.some((id) => !allowed.has(id))) {
            return NextResponse.json({ error: "You can only assign to members who share one of your departments." }, { status: 403 });
        }
    }

    try {
        // One task per assignee.
        const tasks = [];
        for (const assigneeId of assigneeIds) {
            const task = await assignDirectTask({
                assigneeId,
                title,
                description: body.description ?? null,
                dueDate: body.due_date ?? null,
                priority: body.priority ?? null,
                attachmentUrl: body.attachment_url ?? null,
                attachmentName: body.attachment_name ?? null,
                byMemberId: session.id,
                byName: session.full_name,
            });
            tasks.push(task);
        }
        return NextResponse.json({ ok: true, count: tasks.length, tasks, task: tasks[0] });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to assign" }, { status: 500 });
    }
}
