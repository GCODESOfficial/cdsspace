/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { glashQuery, glashMaybeOne } from "@/lib/glashdb/postgres";
import { getTeamSession } from "@/lib/team-auth";
import { lagosDate } from "@/lib/timebook";
import { roleTemplateFor } from "@/lib/team-tasks/role-templates";
import { resolveChecklistFor } from "@/lib/team-tasks/templates-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_STATUSES = ["not_started", "in_progress", "under_review", "needs_revision", "approved", "completed", "delayed"];

/** Reads that touch the new tables are wrapped so the page still works pre-migration. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
        return await fn();
    } catch {
        return fallback;
    }
}

export async function GET() {
    const session = await getTeamSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const memberId = session.id;
    const workDate = lagosDate();

    const tasks = await safe(
        () =>
            glashQuery<any>(
                `select t.id, t.project_id, t.title, t.description, t.priority, t.status, t.progress,
                        t.due_date, t.completed_at, t.origin, p.title as project_title
                   from public.project_tasks t
                   left join public.finance_projects p on p.id = t.project_id
                  where t.assignee_id = $1 and t.status not in ('completed','approved')
                  order by (t.due_date is null), t.due_date asc, t.created_at asc
                  limit 100`,
                [memberId],
            ),
        [],
    );

    // Merge task attachments in a resilient way — if the attachment columns
    // aren't migrated yet, this fails silently and tasks still render.
    const taskIds = (tasks ?? []).map((t: any) => t.id).filter(Boolean);
    if (taskIds.length) {
        const attachments = await safe(
            () => glashQuery<any>(
                `select id, attachment_url, attachment_name from public.project_tasks where id = any($1::uuid[])`,
                [taskIds],
            ),
            [],
        );
        const byId = new Map((attachments ?? []).map((a: any) => [a.id, a]));
        for (const t of tasks) {
            const a: any = byId.get(t.id);
            t.attachment_url = a?.attachment_url ?? null;
            t.attachment_name = a?.attachment_name ?? null;
        }
    }

    const doneToday = await safe(
        () =>
            glashQuery<any>(
                `select id, title, status, due_date, completed_at
                   from public.project_tasks
                  where assignee_id = $1 and status in ('completed','approved')
                    and completed_at::date = $2
                  order by completed_at desc`,
                [memberId, workDate],
            ),
        [],
    );

    const report = await safe(
        () =>
            glashMaybeOne<any>(
                `select completed, pending, blockers, priorities, evidence_links, submitted_at
                   from public.team_daily_reports where team_member_id = $1 and work_date = $2`,
                [memberId, workDate],
            ),
        null,
    );

    const blockers = await safe(
        () =>
            glashQuery<any>(
                `select id, title, detail, severity, status, created_at
                   from public.team_blockers
                  where team_member_id = $1 and status <> 'resolved'
                  order by created_at desc limit 20`,
                [memberId],
            ),
        [],
    );

    // Role checklist: template (code) left-joined with today's completion.
    const template = await resolveChecklistFor({ id: memberId, role_title: session.role_title, department: session.department });
    const savedRows = await safe(
        () =>
            glashQuery<any>(
                `select template_key, done, evidence_link from public.team_daily_checklist
                  where team_member_id = $1 and work_date = $2`,
                [memberId, workDate],
            ),
        [],
    );
    const savedByKey = new Map<string, any>(savedRows.map((r) => [r.template_key, r]));
    const checklist = template.map((t) => {
        const saved = savedByKey.get(t.template_key);
        return { ...t, done: !!saved?.done, evidence_link: saved?.evidence_link ?? null };
    });

    // Attendance snapshot for today (best-effort).
    const attendance = await safe(
        () =>
            glashMaybeOne<any>(
                `select clock_in_at, clock_out_at, current_status, attendance_status
                   from public.team_time_entries where team_member_id = $1 and work_date = $2`,
                [memberId, workDate],
            ),
        null,
    );

    const roleName = roleTemplateFor(session.role_title, session.department)?.name ?? null;

    return NextResponse.json({
        member: { full_name: session.full_name, role_title: session.role_title, department: session.department, role_name: roleName },
        work_date: workDate,
        tasks,
        done_today: doneToday,
        report,
        blockers,
        checklist,
        attendance,
        can_assign: session.is_sub_admin || !!(session as any).is_team_lead,
    });
}

export async function POST(req: NextRequest) {
    const session = await getTeamSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const memberId = session.id;
    const workDate = lagosDate();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    try {
        if (action === "update_task") {
            const taskId = String(body.task_id || "");
            const owns = await glashMaybeOne<{ id: string }>(
                `select id from public.project_tasks where id = $1 and assignee_id = $2`,
                [taskId, memberId],
            );
            if (!owns) return NextResponse.json({ error: "Task not found or not yours" }, { status: 403 });
            const status = TASK_STATUSES.includes(body.status) ? body.status : null;
            const progress = body.progress != null ? Math.max(0, Math.min(100, Number(body.progress))) : null;
            const completed = status === "completed" || status === "approved";
            const row = await glashMaybeOne<any>(
                `update public.project_tasks set
                    status = coalesce($2, status),
                    progress = coalesce($3, progress),
                    completed_at = case when $4 then now() when status in ('completed','approved') and not $4 then completed_at else completed_at end,
                    updated_at = now()
                  where id = $1 returning id, status, progress, completed_at`,
                [taskId, status, progress, completed],
            );
            return NextResponse.json({ ok: true, task: row });
        }

        if (action === "toggle_checklist") {
            const key = String(body.template_key || "");
            const checklist = await resolveChecklistFor({ id: memberId, role_title: session.role_title, department: session.department });
            const item = checklist.find((t) => t.template_key === key);
            if (!item) return NextResponse.json({ error: "Unknown checklist item" }, { status: 400 });
            const done = !!body.done;
            const evidence = body.evidence_link ? String(body.evidence_link).slice(0, 500) : null;
            await glashQuery(
                `insert into public.team_daily_checklist
                   (team_member_id, work_date, template_key, role_key, kind, label, done, done_at, evidence_link)
                 values ($1,$2,$3,$4,$5,$6,$7, case when $7 then now() else null end, $8)
                 on conflict (team_member_id, work_date, template_key) do update set
                   done = excluded.done, done_at = excluded.done_at, evidence_link = coalesce(excluded.evidence_link, public.team_daily_checklist.evidence_link)`,
                [memberId, workDate, key, item.role_key, item.kind, item.label, done, evidence],
            );
            return NextResponse.json({ ok: true });
        }

        if (action === "submit_report") {
            const evidence = Array.isArray(body.evidence_links) ? body.evidence_links.map((s: any) => String(s).slice(0, 500)).filter(Boolean) : [];
            const row = await glashMaybeOne<any>(
                `insert into public.team_daily_reports
                   (team_member_id, work_date, completed, pending, blockers, priorities, evidence_links, submitted_at, updated_at)
                 values ($1,$2,$3,$4,$5,$6,$7::jsonb, now(), now())
                 on conflict (team_member_id, work_date) do update set
                   completed = excluded.completed, pending = excluded.pending, blockers = excluded.blockers,
                   priorities = excluded.priorities, evidence_links = excluded.evidence_links, updated_at = now()
                 returning submitted_at`,
                [memberId, workDate, body.completed ?? null, body.pending ?? null, body.blockers ?? null, body.priorities ?? null, JSON.stringify(evidence)],
            );
            return NextResponse.json({ ok: true, submitted_at: row?.submitted_at });
        }

        if (action === "escalate") {
            const title = String(body.title || "").trim();
            if (!title) return NextResponse.json({ error: "Blocker title required" }, { status: 400 });
            const severity = ["low", "medium", "high", "critical"].includes(body.severity) ? body.severity : "medium";
            const blocker = await glashMaybeOne<any>(
                `insert into public.team_blockers (team_member_id, task_id, title, detail, severity, status)
                 values ($1,$2,$3,$4,$5,'open') returning id, title, severity, status, created_at`,
                [memberId, body.task_id || null, title, body.detail ?? null, severity],
            );
            // Notify leads / sub-admins so it surfaces within the 10-minute rule.
            await glashQuery(
                `insert into public.team_notifications (recipient_id, kind, title, body, link, actor_is_admin)
                 select id, 'blocker_escalated', $1, $2, '/team/my-day', false
                   from public.team_members
                  where is_active and (is_sub_admin = true or is_team_lead = true) and id <> $3`,
                [`Blocker: ${title}`, `${session.full_name} escalated a blocker (${severity}).`, memberId],
            ).catch(() => []);
            return NextResponse.json({ ok: true, blocker });
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Request failed" }, { status: 500 });
    }
}
