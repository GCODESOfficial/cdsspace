/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashMaybeOne, glashOne, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";
import {
  DEFAULT_CAPTURE_INTERVAL_SECONDS,
  WORK_TRACKING_BUCKET,
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
    || hasPermission(session.permissions, "work_tracking.reports");
}

function canViewScreenshots(session: AdminSession) {
  return session.role === "super_admin"
    || hasPermission(session.permissions, "work_tracking")
    || hasPermission(session.permissions, "work_tracking.screenshots");
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
  const discrepancies = weeklyReport.attendance_summary?.idle_percentage > 20
    ? [`Idle time was ${weeklyReport.attendance_summary.idle_percentage}% and should be reviewed with submitted tasks`]
    : [];
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
      `Compared employee report with tracked work. ${matches.length} direct matches, ${additional.length} additional detected contribution areas, ${discrepancies.length} discrepancy flags.`,
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
  const screenshotAccess = canViewScreenshots(session!);

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
        page_url, project_hint, activity_state, idle_seconds, screenshot_storage_path,
        expires_at, ai_status, ai_summary, ai_categories, detected_apps, detected_websites,
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

  // Sign screenshot URLs (10-min TTL) for admins with screenshot permission.
  const storage = screenshotAccess ? (getGlashDbAdmin() as any).storage.from(WORK_TRACKING_BUCKET) : null;
  const snapshotRows = await Promise.all((snapshots || []).map(async (snapshot: any) => {
    let screenshotUrl: string | null = null;
    if (storage && snapshot.screenshot_storage_path) {
      try {
        const { data } = await storage.createSignedUrl(snapshot.screenshot_storage_path, 60 * 10);
        screenshotUrl = data?.signedUrl || null;
      } catch {
        screenshotUrl = null;
      }
    }
    return { ...snapshot, screenshot_url: screenshotUrl };
  }));

  await logAccess(session!, {
    action: memberId ? "view_member_work_tracking" : "view_work_tracking_overview",
    reportType: memberId ? "member_timeline" : "overview",
    teamMemberId: memberId,
    metadata: { date, week_start: range.week_start, screenshot_access: screenshotAccess },
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

  return NextResponse.json({
    ok: true,
    date,
    week: range,
    settings: settings || null,
    members,
    sessions,
    entries,
    daily_reports: reports,
    snapshots: snapshotRows,
    weekly_reports: weeklyReports,
    self_reports: selfReports,
    comparisons,
    access_logs: accessLogs,
    stats,
    screenshot_access: screenshotAccess,
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
