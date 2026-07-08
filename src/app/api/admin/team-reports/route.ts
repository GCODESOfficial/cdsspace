/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { glashQuery } from "@/lib/glashdb/postgres";
import { normalizeDate, weekRange } from "@/lib/work-tracking";
import { lagosDate } from "@/lib/timebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Team Reports — super-admin only.
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
  if (session.role !== "super_admin") {
    return NextResponse.json({ ok: false, error: "Team Reports is available to the super admin only." }, { status: 403 });
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
        `select * from public.team_work_tracking_self_reports where week_start = $1`,
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
        `select team_member_id, status, screenshot_count, active_seconds, idle_seconds, started_at, last_capture_at
           from public.team_work_tracking_sessions where work_date = $1`,
        [date],
      ).catch(() => []),
    ]);

    const byMember = <T extends { team_member_id: string }>(rows: T[]) =>
      new Map(rows.map((r) => [r.team_member_id, r]));

    const manualMap = byMember(manualDaily);
    const autoMap = byMember(autoDaily);
    const selfMap = byMember(selfReports);
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
        idle_seconds: Number(prev.idle_seconds || 0) + Number(s.idle_seconds || 0),
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
