/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashMaybeOne, glashOne, glashQuery } from "@/lib/glashdb/postgres";
import {
  DEFAULT_CAPTURE_INTERVAL_SECONDS,
  normalizeDate,
  uniqueStrings,
  weekRange,
} from "@/lib/work-tracking";
import { generateDailyReport, generateWeeklyReport, purgeExpiredScreenshots } from "@/lib/work-tracking-reports";
import { lagosDate } from "@/lib/timebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canView(session: AdminSession) {
  return session.role === "super_admin"
    || hasPermission(session.permissions, "work_tracking")
    || hasPermission(session.permissions, "work_tracking.view");
}

function canManage(session: AdminSession) {
  return session.role === "super_admin"
    || hasPermission(session.permissions, "work_tracking")
    || hasPermission(session.permissions, "work_tracking.reports")
    // Team Reports' Generate & Compare buttons post here too.
    || hasPermission(session.permissions, "team_reports.generate");
}

function canManageSettings(session: AdminSession) {
  return session.role === "super_admin"
    || hasPermission(session.permissions, "work_tracking")
    || hasPermission(session.permissions, "work_tracking.settings");
}

function canManageRetention(session: AdminSession) {
  return session.role === "super_admin"
    || hasPermission(session.permissions, "work_tracking")
    || hasPermission(session.permissions, "work_tracking.retention");
}

async function requireWorkTrackingAdmin() {
  const session = await getAdminSession();
  if (!session) return { session: null, denied: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!canView(session)) return { session, denied: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  return { session, denied: null };
}

async function logAccess(session: AdminSession, input: {
  action: string;
  reportType: string;
  reportId?: string | null;
  teamMemberId?: string | null;
  metadata?: Record<string, any>;
}) {
  await glashQuery(
    `insert into public.team_work_tracking_report_access_log
      (actor_kind, actor_id, actor_name, team_member_id, report_type, report_id, action, metadata)
     values ('admin',$1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      session.memberId || session.email,
      session.name || session.email,
      input.teamMemberId || null,
      input.reportType,
      input.reportId || null,
      input.action,
      JSON.stringify(input.metadata || {}),
    ],
  ).catch(() => []);
}

function dateOffset(dateString: string, days: number) {
  const cursor = new Date(`${dateString}T12:00:00+01:00`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

function dateKey(value: unknown) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return lagosDate(value);
  return "";
}

function eachDate(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00+01:00`);
  const stop = new Date(`${end}T12:00:00+01:00`);
  while (cursor <= stop) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function compareWeeklyReport(memberId: string, weekStart: string) {
  const range = weekRange(weekStart);
  const [selfReport, weeklyReport] = await Promise.all([
    glashMaybeOne<any>(
      "select * from public.team_work_tracking_self_reports where team_member_id = $1 and week_start = $2 limit 1",
      [memberId, range.week_start],
    ),
    glashMaybeOne<any>(
      "select * from public.team_work_tracking_weekly_reports where team_member_id = $1 and week_start = $2 limit 1",
      [memberId, range.week_start],
    ),
  ]);
  if (!selfReport) throw new Error("Employee weekly report has not been submitted.");
  if (!weeklyReport) throw new Error("Generate the weekly AI report first.");

  const selfText = [
    selfReport.tasks_completed,
    selfReport.challenges,
    selfReport.wins,
    selfReport.goals_next_week,
  ].filter(Boolean).join("\n").toLowerCase();
  const projects = Object.keys(weeklyReport.project_contributions || {});
  const deliverables = uniqueStrings([
    ...(weeklyReport.scorecard?.deliverables ? [`${weeklyReport.scorecard.deliverables} deliverables detected`] : []),
    ...projects,
  ]);
  const matches = projects.filter((project) => selfText.includes(project.toLowerCase())).slice(0, 8);
  const additional = projects.filter((project) => !selfText.includes(project.toLowerCase())).slice(0, 8);
  const omissions = additional.length ? additional.map((item) => `${item} was detected but not clearly reported`) : [];
  // A quiet browser tab is not evidence of idleness: the member may be
  // researching, studying or working in another tool. Only compare explicit
  // task/focus evidence with the member's submitted report.
  const discrepancies: string[] = [];
  const confidence = Math.max(35, Math.min(95, matches.length * 20 + (projects.length ? 35 : 20)));
  const data = await glashOne<any>(
    `insert into public.team_work_tracking_report_comparisons
      (team_member_id, week_start, week_end, self_report_id, weekly_report_id,
       matches, omissions, additional_detected_work, discrepancies, confidence_score, ai_summary)
     values ($1,$2,$3,$4,$5,$6::text[],$7::text[],$8::text[],$9::text[],$10,$11)
     on conflict (team_member_id, week_start) do update set
       week_end = excluded.week_end,
       self_report_id = excluded.self_report_id,
       weekly_report_id = excluded.weekly_report_id,
       matches = excluded.matches,
       omissions = excluded.omissions,
       additional_detected_work = excluded.additional_detected_work,
       discrepancies = excluded.discrepancies,
       confidence_score = excluded.confidence_score,
       ai_summary = excluded.ai_summary,
       updated_at = now()
     returning *`,
    [
      memberId,
      range.week_start,
      range.week_end,
      selfReport.id,
      weeklyReport.id,
      matches,
      omissions,
      additional,
      discrepancies,
      confidence,
      `Compared the member's report with their confirmed work context. ${matches.length} direct matches and ${additional.length} additional recorded contribution areas.`,
    ],
  );
  return { ...data, detected_deliverables: deliverables };
}

export async function GET(req: NextRequest) {
  const { session, denied } = await requireWorkTrackingAdmin();
  if (denied) return denied;

  const url = new URL(req.url);
  const date = normalizeDate(url.searchParams.get("date"), lagosDate());
  const memberId = url.searchParams.get("member_id");
  const range = weekRange(date);
  const [members, sessions, entries, dailyReports, snapshots, weeklyReports, selfReports, comparisons, accessLogs, settings] = await Promise.all([
    glashQuery("select id, full_name, email, role_title, department, is_active from public.team_members where is_active = true order by full_name asc"),
    glashQuery("select * from public.team_work_tracking_sessions where work_date = $1 order by started_at desc", [date]),
    glashQuery(
      `select id, team_member_id, work_date, work_mode, attendance_status, current_status,
        clock_in_at, clock_out_at, scores, total_work_minutes
       from public.team_time_entries
       where work_date = $1`,
      [date],
    ),
    glashQuery("select * from public.team_work_tracking_daily_reports where work_date = $1", [date]),
    glashQuery(
      `select id, session_id, team_member_id, work_date, captured_at, active_app, page_title,
        page_url, project_hint, activity_state, ai_status, ai_summary, ai_categories, detected_apps, detected_websites,
        detected_projects, detected_deliverables, productivity_score, focus_score, confidence, metadata
       from public.team_work_tracking_snapshots
       where work_date = $1
         and ($2::uuid is null or team_member_id = $2::uuid)
       order by captured_at desc
       limit $3`,
      [date, memberId || null, memberId ? 80 : 24],
    ),
    glashQuery("select * from public.team_work_tracking_weekly_reports where week_start = $1", [range.week_start]),
    glashQuery("select * from public.team_work_tracking_self_reports where week_start = $1", [range.week_start]),
    glashQuery("select * from public.team_work_tracking_report_comparisons where week_start = $1", [range.week_start]),
    glashQuery("select * from public.team_work_tracking_report_access_log order by created_at desc limit 30"),
    glashMaybeOne("select * from public.team_work_tracking_settings where id = 1 limit 1"),
  ]);

  await logAccess(session!, {
    action: memberId ? "view_member_work_tracking" : "view_work_tracking_overview",
    reportType: memberId ? "member_timeline" : "overview",
    teamMemberId: memberId,
    metadata: { date, week_start: range.week_start, tracking_mode: "activity_heartbeat" },
  });

  const reports = dailyReports || [];
  const stats = {
    active_sessions: (sessions || []).filter((item: any) => item.status === "active").length,
    paused_sessions: (sessions || []).filter((item: any) => item.status === "paused").length,
    tracked_members: new Set((sessions || []).map((item: any) => item.team_member_id)).size,
    average_productivity: reports.length ? Math.round(reports.reduce((sum: number, report: any) => sum + Number(report.productivity_score || 0), 0) / reports.length) : 0,
    average_focus: reports.length ? Math.round(reports.reduce((sum: number, report: any) => sum + Number(report.focus_score || 0), 0) / reports.length) : 0,
    high_burnout_risk: (weeklyReports || []).filter((report: any) => report.burnout_risk === "high").length,
    underutilized: (weeklyReports || []).filter((report: any) => report.underutilization_risk === "high").length,
  };

  let trailing7Days: any[] = [];
  if (memberId) {
    const trailingStart = dateOffset(date, -6);
    const [trailingEntries, trailingReports, trailingSessions] = await Promise.all([
      glashQuery<any>(
        `select id, team_member_id, work_date, attendance_status, current_status,
                clock_in_at, clock_out_at, total_work_minutes, overtime_minutes, scores
           from public.team_time_entries
          where team_member_id = $1
            and work_date >= $2
            and work_date <= $3
          order by work_date asc`,
        [memberId, trailingStart, date],
      ),
      glashQuery<any>(
        `select *
           from public.team_work_tracking_daily_reports
          where team_member_id = $1
            and work_date >= $2
            and work_date <= $3
          order by work_date asc`,
        [memberId, trailingStart, date],
      ),
      glashQuery<any>(
        `select work_date,
                count(*)::int as session_count,
                coalesce(sum(
                  coalesce(nullif(metadata->>'checkpoint_count', '')::int, screenshot_count, 0)
                ),0)::int as evidence_count,
                coalesce(sum(active_seconds),0)::int as active_seconds,
                max(last_capture_at) as last_capture_at
           from public.team_work_tracking_sessions
          where team_member_id = $1
            and work_date >= $2
            and work_date <= $3
          group by work_date
          order by work_date asc`,
        [memberId, trailingStart, date],
      ),
    ]);
    const entryByDate = new Map((trailingEntries || []).map((entry: any) => [dateKey(entry.work_date), entry]));
    const reportByDate = new Map((trailingReports || []).map((report: any) => [dateKey(report.work_date), report]));
    const sessionByDate = new Map((trailingSessions || []).map((session: any) => [dateKey(session.work_date), session]));
    trailing7Days = eachDate(trailingStart, date).map((day) => ({
      date: day,
      entry: entryByDate.get(day) || null,
      report: reportByDate.get(day) || null,
      session: sessionByDate.get(day) || null,
    }));
  }

  return NextResponse.json({
    ok: true,
    date,
    week: range,
    settings: settings || null,
    members,
    sessions,
    entries,
    daily_reports: reports,
    snapshots,
    weekly_reports: weeklyReports,
    self_reports: selfReports,
    comparisons,
    access_logs: accessLogs,
    stats,
    trailing_7_days: trailing7Days,
    actor: session?.name,
  });
}

export async function POST(req: NextRequest) {
  const { session, denied } = await requireWorkTrackingAdmin();
  if (denied) return denied;
  if (!canManage(session!)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
    if (action === "generate_daily_report") {
      const memberId = body.member_id;
      const date = normalizeDate(body.date, lagosDate());
      if (!memberId) return NextResponse.json({ ok: false, error: "member_id is required." }, { status: 400 });
      const report = await generateDailyReport(memberId, date);
      await logAccess(session!, {
        action: "generate_daily_report",
        reportType: "daily_report",
        reportId: report.id,
        teamMemberId: memberId,
        metadata: { date },
      });
      return NextResponse.json({ ok: true, report });
    }

    if (action === "generate_all_daily_reports") {
      const date = normalizeDate(body.date, lagosDate());
      // Optional scoping: a specific set of member ids (e.g. the department
      // filter on the dashboard). Otherwise run every active team member.
      const requestedIds = Array.isArray(body.member_ids)
        ? (body.member_ids as unknown[]).map(String).filter(Boolean)
        : null;
      const members = await glashQuery<{ id: string }>(
        requestedIds && requestedIds.length
          ? "select id from public.team_members where is_active = true and id = any($1::uuid[])"
          : "select id from public.team_members where is_active = true",
        requestedIds && requestedIds.length ? [requestedIds] : [],
      );
      // Generate every member's daily report at once, resilient to individual
      // failures so one bad member doesn't sink the whole batch.
      const results = await Promise.allSettled(
        members.map((m) => generateDailyReport(m.id, date)),
      );
      const generated = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - generated;
      await logAccess(session!, {
        action: "generate_all_daily_reports",
        reportType: "daily_report",
        metadata: { date, generated, failed, total: results.length },
      });
      return NextResponse.json({ ok: true, generated, failed, total: results.length });
    }

    if (action === "generate_weekly_report") {
      const memberId = body.member_id;
      const range = weekRange(body.week_start || body.date || lagosDate());
      if (!memberId) return NextResponse.json({ ok: false, error: "member_id is required." }, { status: 400 });
      const report = await generateWeeklyReport(memberId, range.week_start);
      await logAccess(session!, {
        action: "generate_weekly_report",
        reportType: "weekly_report",
        reportId: report.id,
        teamMemberId: memberId,
        metadata: range,
      });
      return NextResponse.json({ ok: true, report });
    }

    if (action === "compare_weekly_report") {
      const memberId = body.member_id;
      const range = weekRange(body.week_start || body.date || lagosDate());
      if (!memberId) return NextResponse.json({ ok: false, error: "member_id is required." }, { status: 400 });
      const comparison = await compareWeeklyReport(memberId, range.week_start);
      await logAccess(session!, {
        action: "compare_weekly_report",
        reportType: "comparison",
        reportId: comparison.id,
        teamMemberId: memberId,
        metadata: range,
      });
      return NextResponse.json({ ok: true, comparison });
    }

    if (action === "purge_expired_screenshots") {
      if (!canManageRetention(session!)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      const deleted = await purgeExpiredScreenshots(150);
      await logAccess(session!, {
        action: "purge_expired_screenshots",
        reportType: "retention",
        metadata: { count: deleted },
      });
      return NextResponse.json({ ok: true, deleted });
    }

    if (action === "update_settings") {
      if (!canManageSettings(session!)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      const payload = {
        enabled: body.enabled !== false,
        capture_interval_seconds: Math.max(60, Math.min(1800, Number(body.capture_interval_seconds || DEFAULT_CAPTURE_INTERVAL_SECONDS))),
        screenshot_retention_days: Math.max(1, Math.min(30, Number(body.screenshot_retention_days || 7))),
        idle_threshold_seconds: Math.max(30, Math.min(1800, Number(body.idle_threshold_seconds || 180))),
        approved_sub_admin_permissions: Array.isArray(body.approved_sub_admin_permissions)
          ? body.approved_sub_admin_permissions.map(String)
          : ["work_tracking.view"],
      };
      const settings = await glashOne(
        `insert into public.team_work_tracking_settings
          (id, enabled, capture_interval_seconds, screenshot_retention_days, idle_threshold_seconds, approved_sub_admin_permissions)
         values (1,$1,$2,$3,$4,$5::text[])
         on conflict (id) do update set
           enabled = excluded.enabled,
           capture_interval_seconds = excluded.capture_interval_seconds,
           screenshot_retention_days = excluded.screenshot_retention_days,
           idle_threshold_seconds = excluded.idle_threshold_seconds,
           approved_sub_admin_permissions = excluded.approved_sub_admin_permissions,
           updated_at = now()
         returning *`,
        [
          payload.enabled,
          payload.capture_interval_seconds,
          payload.screenshot_retention_days,
          payload.idle_threshold_seconds,
          payload.approved_sub_admin_permissions,
        ],
      );
      await logAccess(session!, { action: "update_settings", reportType: "settings", metadata: payload });
      return NextResponse.json({ ok: true, settings });
    }

    return NextResponse.json({ ok: false, error: "Unsupported work tracking action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Work tracking admin action failed." },
      { status: 500 },
    );
  }
}
