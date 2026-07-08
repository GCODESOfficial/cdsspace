/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { lagosDate } from "@/lib/timebook";
import { assignDirectTask } from "@/lib/team-tasks/server";
import { checklistTemplateFor } from "@/lib/team-tasks/role-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(session: any): boolean {
    if (!session) return false;
    if (session.role === "super_admin") return true;
    return (
        hasPermission(session.permissions, "team_today") ||
        // transitional: broad team-management roles keep access
        hasPermission(session.permissions, "team_members")
    );
}

export async function GET(req: NextRequest) {
    const session = await getAdminSessionAsync(req);
    if (!guard(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const workDate = lagosDate();

    try {
        const members = await glashQuery<any>(
            `select id, full_name, role_title, department, avatar_url, coalesce(is_team_lead,false) as is_team_lead
               from public.team_members where is_active order by department nulls last, full_name`,
        );

        const attendance = await glashQuery<any>(
            `select team_member_id, clock_in_at, clock_out_at, current_status, attendance_status
               from public.team_time_entries where work_date = $1`,
            [workDate],
        ).catch(() => []);
        const attByMember = new Map(attendance.map((a) => [a.team_member_id, a]));

        const taskStats = await glashQuery<any>(
            // completed_at is timestamptz — cast in Lagos time so "done today"
            // matches the Lagos work_date instead of the UTC session date.
            `select assignee_id,
                    count(*) filter (where status not in ('completed','approved')) as open,
                    count(*) filter (where status not in ('completed','approved') and due_date is not null and due_date < $1) as overdue,
                    count(*) filter (where status in ('completed','approved') and (completed_at at time zone 'Africa/Lagos')::date = $1::date) as done_today
               from public.project_tasks where assignee_id is not null group by assignee_id`,
            [workDate],
        ).catch(() => []);
        const taskByMember = new Map(taskStats.map((t) => [t.assignee_id, t]));

        const reports = await glashQuery<any>(
            `select team_member_id from public.team_daily_reports where work_date = $1`,
            [workDate],
        ).catch(() => []);
        const reported = new Set(reports.map((r) => r.team_member_id));

        const blockers = await glashQuery<any>(
            `select team_member_id, count(*) as n from public.team_blockers where status <> 'resolved' group by team_member_id`,
            [],
        ).catch(() => []);
        const blockerByMember = new Map(blockers.map((b) => [b.team_member_id, Number(b.n)]));

        const checklistDone = await glashQuery<any>(
            `select team_member_id, count(*) filter (where done) as done from public.team_daily_checklist
              where work_date = $1 group by team_member_id`,
            [workDate],
        ).catch(() => []);
        const doneByMember = new Map(checklistDone.map((c) => [c.team_member_id, Number(c.done)]));

        const rows = members.map((m) => {
            const t = taskByMember.get(m.id);
            const total = checklistTemplateFor(m.role_title, m.department).length;
            return {
                id: m.id,
                full_name: m.full_name,
                role_title: m.role_title,
                department: m.department,
                avatar_url: m.avatar_url,
                is_team_lead: m.is_team_lead,
                attendance: attByMember.get(m.id) ?? null,
                tasks: {
                    open: Number(t?.open ?? 0),
                    overdue: Number(t?.overdue ?? 0),
                    done_today: Number(t?.done_today ?? 0),
                },
                report_submitted: reported.has(m.id),
                blockers: blockerByMember.get(m.id) ?? 0,
                checklist: { done: doneByMember.get(m.id) ?? 0, total },
            };
        });

        const summary = {
            total: rows.length,
            checked_in: rows.filter((r) => r.attendance?.clock_in_at).length,
            late: rows.filter((r) => r.attendance?.attendance_status === "late").length,
            reports_submitted: rows.filter((r) => r.report_submitted).length,
            open_blockers: rows.reduce((s, r) => s + Number(r.blockers), 0),
            overdue_tasks: rows.reduce((s, r) => s + r.tasks.overdue, 0),
        };

        return NextResponse.json({ work_date: workDate, summary, members: rows });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getAdminSessionAsync(req);
    if (!guard(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));

    if (body.action === "assign") {
        const title = String(body.title || "").trim();
        const assigneeId = String(body.assignee_id || "");
        if (!title || !assigneeId) return NextResponse.json({ error: "Assignee and title required" }, { status: 400 });
        try {
            const task = await assignDirectTask({
                assigneeId,
                title,
                description: body.description ?? null,
                dueDate: body.due_date ?? null,
                priority: body.priority ?? null,
                byAdmin: true,
                byName: (session as any).name || "Admin",
            });
            return NextResponse.json({ ok: true, task });
        } catch (e) {
            return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to assign" }, { status: 500 });
        }
    }

    if (body.action === "resolve_blocker") {
        const id = String(body.id || "");
        await glashQuery(`update public.team_blockers set status='resolved', resolved_at=now() where id=$1`, [id]).catch(() => []);
        return NextResponse.json({ ok: true });
    }

    // Admin lists members to assign to.
    if (body.action === "members") {
        const members = await glashQuery<any>(
            `select id, full_name, role_title, department from public.team_members where is_active order by full_name`,
        ).catch(() => []);
        return NextResponse.json({ members });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
