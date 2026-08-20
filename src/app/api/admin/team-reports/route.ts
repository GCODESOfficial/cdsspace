/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";
import { normalizeDate, weekRange } from "@/lib/work-tracking";
import { lagosDate } from "@/lib/timebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Team Reports - super admin, or any role granted the Team Reports permission.
 *
 * One view that puts, side by side, for each team member:
 *   - the manually submitted daily report (team_daily_reports)
 *   - the manually submitted weekly self-report (work tracking self reports)
 *   - the automated tracking report (team_work_tracking_daily_reports)
 *   - the automated-vs-manual weekly comparison
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const canView = session.role === "super_admin"
    || hasPermission(session.permissions, "team_reports")
    || hasPermission(session.permissions, "team_reports.view");
  if (!canView) {
    return NextResponse.json({ ok: false, error: "You do not have permission to view Team Reports." }, { status: 403 });
  }

  const url = new URL(req.url);
  const date = normalizeDate(url.searchParams.get("date"), lagosDate());
  const range = weekRange(date);

  try {
    const [members, manualDaily, autoDaily, selfReports, weeklyReports, comparisons, attendance, sessions] = await Promise.all([
      glashQuery<any>(
        `select id, full_name, role_title, department, avatar_url
           from public.team_members where is_active order by full_name`,
      ),
      glashQuery<any>(
        `select * from public.team_daily_reports where work_date = $1`,
        [date],
      ).catch(() => []),
      glashQuery<any>(
        `select * from public.team_work_tracking_daily_reports where work_date = $1`,
        [date],
      ).catch(() => []),
      glashQuery<any>(
        `select * from public.team_work_tracking_self_reports where week_start = $1 and is_draft = false`,
        [range.week_start],
      ).catch(() => []),
      glashQuery<any>(
        `select * from public.team_work_tracking_weekly_reports where week_start = $1`,
        [range.week_start],
      ).catch(() => []),
      glashQuery<any>(
        `select * from public.team_work_tracking_report_comparisons where week_start = $1`,
        [range.week_start],
      ).catch(() => []),
      glashQuery<any>(
        `select team_member_id, attendance_status, clock_in_at, clock_out_at, total_work_minutes
           from public.team_time_entries where work_date = $1`,
        [date],
      ).catch(() => []),
      glashQuery<any>(
        `select team_member_id, status, screenshot_count, active_seconds, started_at, last_capture_at, metadata
           from public.team_work_tracking_sessions where work_date = $1`,
        [date],
      ).catch(() => []),
    ]);

    const selfReportIds = selfReports.map((report: any) => report.id);
    const reportAttachments = selfReportIds.length
      ? await glashQuery<any>(
          `select * from public.team_work_tracking_self_report_attachments
            where self_report_id = any($1::uuid[])
            order by created_at asc`,
          [selfReportIds],
        ).catch(() => [])
      : [];
    const attachmentsByReport = new Map<string, any[]>();
    for (const attachment of reportAttachments) {
      const items = attachmentsByReport.get(attachment.self_report_id) || [];
      items.push(attachment);
      attachmentsByReport.set(attachment.self_report_id, items);
    }
    const selfReportsWithAttachments = selfReports.map((report: any) => ({
      ...report,
      attachments: attachmentsByReport.get(report.id) || [],
    }));

    const byMember = <T extends { team_member_id: string }>(rows: T[]) =>
      new Map(rows.map((r) => [r.team_member_id, r]));

    const manualMap = byMember(manualDaily);
    const autoMap = byMember(autoDaily);
    const selfMap = byMember(selfReportsWithAttachments);
    const weeklyMap = byMember(weeklyReports);
    const comparisonMap = byMember(comparisons);
    const attMap = byMember(attendance);
    const sessionMap = new Map<string, any>();
    for (const s of sessions) {
      const prev = sessionMap.get(s.team_member_id);
      if (!prev) { sessionMap.set(s.team_member_id, s); continue; }
      // Merge multiple sessions for the day into one rollup.
      sessionMap.set(s.team_member_id, {
        ...prev,
        screenshot_count: Number(prev.screenshot_count || 0) + Number(s.screenshot_count || 0),
        active_seconds: Number(prev.active_seconds || 0) + Number(s.active_seconds || 0),
        metadata: {
          ...prev.metadata,
          ...s.metadata,
          checkpoint_count:
            Number(prev.metadata?.checkpoint_count ?? prev.screenshot_count ?? 0)
            + Number(s.metadata?.checkpoint_count ?? s.screenshot_count ?? 0),
        },
        status: prev.status === "active" || s.status === "active" ? "active" : prev.status,
      });
    }

    const rows = members.map((m: any) => ({
      member: m,
      attendance: attMap.get(m.id) ?? null,
      tracking_session: sessionMap.get(m.id) ?? null,
      manual_daily: manualMap.get(m.id) ?? null,
      auto_daily: autoMap.get(m.id) ?? null,
      self_report: selfMap.get(m.id) ?? null,
      weekly_report: weeklyMap.get(m.id) ?? null,
      comparison: comparisonMap.get(m.id) ?? null,
    }));

    const summary = {
      total: members.length,
      manual_submitted: manualDaily.length,
      auto_generated: autoDaily.length,
      self_reports: selfReports.length,
      comparisons: comparisons.length,
      tracking_now: sessions.filter((s: any) => s.status === "active").length,
    };

    return NextResponse.json({ ok: true, date, week: range, summary, rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to load team reports" }, { status: 500 });
  }
}
