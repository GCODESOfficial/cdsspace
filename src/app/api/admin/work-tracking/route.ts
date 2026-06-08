/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { chatComplete } from "@/lib/ai/openai";
import { glashMaybeOne, glashOne, glashQuery } from "@/lib/glashdb/postgres";
import {
  DEFAULT_CAPTURE_INTERVAL_SECONDS,
  aggregateSnapshots,
  normalizeDate,
  parseJsonObject,
  uniqueStrings,
  weekRange,
} from "@/lib/work-tracking";
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

async function maybeEnhanceDailyReport(aggregate: any, member: any, date: string) {
  if (!process.env.OPENAI_API_KEY) return aggregate;
  try {
    const result = await chatComplete(
      [
        {
          role: "system",
          content: "You create concise internal productivity summaries. Return JSON only and do not include sensitive personal content.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Improve this work-tracking daily report without changing numeric scores.",
            member: { name: member?.full_name, role: member?.role_title, department: member?.department },
            date,
            aggregate,
            expected_json: {
              summary: "2 concise sentences",
              strengths: ["short bullets"],
              concerns: ["short bullets"],
              manager_recommendations: ["short bullets"],
              hidden_achievements: ["short bullets"],
            },
          }),
        },
      ],
      { temperature: 0.2, max_tokens: 600, response_format: { type: "json_object" } },
    );
    const parsed = parseJsonObject(result.text);
    if (!parsed) return aggregate;
    return {
      ...aggregate,
      summary: String(parsed.summary || aggregate.summary).slice(0, 1200),
      strengths: uniqueStrings(parsed.strengths || aggregate.strengths).slice(0, 6),
      concerns: uniqueStrings(parsed.concerns || aggregate.concerns).slice(0, 6),
      manager_recommendations: uniqueStrings(parsed.manager_recommendations || aggregate.manager_recommendations).slice(0, 6),
      hidden_achievements: uniqueStrings(parsed.hidden_achievements || aggregate.hidden_achievements).slice(0, 6),
      ai_model: result.model,
    };
  } catch {
    return aggregate;
  }
}

async function generateDailyReport(memberId: string, date: string) {
  const [member, snapshots, entry] = await Promise.all([
    glashMaybeOne("select id, full_name, email, role_title, department from public.team_members where id = $1 limit 1", [memberId]),
    glashQuery(
      `select * from public.team_work_tracking_snapshots
       where team_member_id = $1 and work_date = $2
       order by captured_at asc`,
      [memberId, date],
    ),
    glashMaybeOne<any>(
      `select scores, total_work_minutes, attendance_status
       from public.team_time_entries
       where team_member_id = $1 and work_date = $2
       limit 1`,
      [memberId, date],
    ),
  ]);

  const attendanceScore = Number(entry?.scores?.attendance ?? entry?.scores?.productivity ?? 0);
  const aggregate = aggregateSnapshots(snapshots || [], {
    intervalSeconds: DEFAULT_CAPTURE_INTERVAL_SECONDS,
    attendanceScore,
  });
  const enhanced = await maybeEnhanceDailyReport(aggregate, member, date);
  return glashOne(
    `insert into public.team_work_tracking_daily_reports (
       team_member_id, work_date, active_minutes, idle_minutes, meeting_minutes,
       focus_score, productivity_score, consistency_score, collaboration_score,
       attendance_score, reliability_score, overall_score, most_used_apps,
       time_by_category, time_by_project, deliverables, summary, strengths,
       concerns, manager_recommendations, hidden_achievements, ai_model,
       ai_status, generated_at, metadata
     )
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16::text[],$17,$18::text[],$19::text[],$20::text[],$21::text[],$22,'generated',now(),$23::jsonb)
     on conflict (team_member_id, work_date) do update set
       active_minutes = excluded.active_minutes,
       idle_minutes = excluded.idle_minutes,
       meeting_minutes = excluded.meeting_minutes,
       focus_score = excluded.focus_score,
       productivity_score = excluded.productivity_score,
       consistency_score = excluded.consistency_score,
       collaboration_score = excluded.collaboration_score,
       attendance_score = excluded.attendance_score,
       reliability_score = excluded.reliability_score,
       overall_score = excluded.overall_score,
       most_used_apps = excluded.most_used_apps,
       time_by_category = excluded.time_by_category,
       time_by_project = excluded.time_by_project,
       deliverables = excluded.deliverables,
       summary = excluded.summary,
       strengths = excluded.strengths,
       concerns = excluded.concerns,
       manager_recommendations = excluded.manager_recommendations,
       hidden_achievements = excluded.hidden_achievements,
       ai_model = excluded.ai_model,
       ai_status = 'generated',
       generated_at = now(),
       metadata = excluded.metadata,
       updated_at = now()
     returning *`,
    [
      memberId,
      date,
      enhanced.active_minutes,
      enhanced.idle_minutes,
      enhanced.meeting_minutes,
      enhanced.focus_score,
      enhanced.productivity_score,
      enhanced.consistency_score,
      enhanced.collaboration_score,
      enhanced.attendance_score,
      enhanced.reliability_score,
      enhanced.overall_score,
      JSON.stringify(enhanced.most_used_apps),
      JSON.stringify(enhanced.time_by_category),
      JSON.stringify(enhanced.time_by_project),
      enhanced.deliverables,
      enhanced.summary,
      enhanced.strengths,
      enhanced.concerns,
      enhanced.manager_recommendations,
      enhanced.hidden_achievements,
      enhanced.ai_model || "local-aggregate",
      JSON.stringify({
        snapshot_count: snapshots?.length || 0,
        attendance_status: entry?.attendance_status || null,
        source: enhanced.ai_model ? "ai_enhanced" : "local_aggregate",
      }),
    ],
  );
}

function riskLabel(value: number) {
  if (value >= 75) return "high";
  if (value >= 45) return "medium";
  return "low";
}

async function generateWeeklyReport(memberId: string, weekStart: string) {
  const range = weekRange(weekStart);
  const reports = await glashQuery<any>(
    `select * from public.team_work_tracking_daily_reports
     where team_member_id = $1 and work_date >= $2 and work_date <= $3
     order by work_date asc`,
    [memberId, range.week_start, range.week_end],
  );
  const totals = reports.reduce(
    (acc: any, report: any) => {
      acc.active += Number(report.active_minutes || 0);
      acc.idle += Number(report.idle_minutes || 0);
      acc.overall += Number(report.overall_score || 0);
      acc.productivity += Number(report.productivity_score || 0);
      acc.focus += Number(report.focus_score || 0);
      for (const [key, value] of Object.entries(report.time_by_project || {})) {
        acc.projects[key] = (acc.projects[key] || 0) + Number(value || 0);
      }
      for (const app of report.most_used_apps || []) {
        acc.apps[app.name] = (acc.apps[app.name] || 0) + Number(app.minutes || 0);
      }
      acc.deliverables.push(...(report.deliverables || []));
      return acc;
    },
    { active: 0, idle: 0, overall: 0, productivity: 0, focus: 0, projects: {}, apps: {}, deliverables: [] },
  );
  const days = Math.max(1, reports.length);
  const idlePct = totals.active ? Math.round((totals.idle / totals.active) * 100) : 0;
  const avgOverall = Math.round(totals.overall / days);
  const avgProductivity = Math.round(totals.productivity / days);
  const avgFocus = Math.round(totals.focus / days);
  const scorecard = {
    attendance: Math.round(reports.reduce((sum: number, report: any) => sum + Number(report.attendance_score || 0), 0) / days),
    productivity: avgProductivity,
    deliverables: uniqueStrings(totals.deliverables).length,
    consistency: Math.round(reports.reduce((sum: number, report: any) => sum + Number(report.consistency_score || 0), 0) / days),
    collaboration: Math.round(reports.reduce((sum: number, report: any) => sum + Number(report.collaboration_score || 0), 0) / days),
    overall: avgOverall,
  };
  return glashOne(
    `insert into public.team_work_tracking_weekly_reports (
       team_member_id, week_start, week_end, summary, project_contributions,
       attendance_summary, application_usage, workload_trends, strengths,
       concerns, burnout_risk, underutilization_risk, overall_score,
       scorecard, ai_status, generated_at, metadata
     )
     values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::text[],$10::text[],$11,$12,$13,$14::jsonb,'generated',now(),$15::jsonb)
     on conflict (team_member_id, week_start) do update set
       week_end = excluded.week_end,
       summary = excluded.summary,
       project_contributions = excluded.project_contributions,
       attendance_summary = excluded.attendance_summary,
       application_usage = excluded.application_usage,
       workload_trends = excluded.workload_trends,
       strengths = excluded.strengths,
       concerns = excluded.concerns,
       burnout_risk = excluded.burnout_risk,
       underutilization_risk = excluded.underutilization_risk,
       overall_score = excluded.overall_score,
       scorecard = excluded.scorecard,
       ai_status = 'generated',
       generated_at = now(),
       metadata = excluded.metadata,
       updated_at = now()
     returning *`,
    [
      memberId,
      range.week_start,
      range.week_end,
      reports.length
        ? `Weekly tracking captured ${Math.round(totals.active / 60 * 10) / 10} active hours with an average score of ${avgOverall}%.`
        : "No daily work tracking reports were generated for this week yet.",
      JSON.stringify(totals.projects),
      JSON.stringify({
        tracked_days: reports.length,
        active_minutes: totals.active,
        idle_minutes: totals.idle,
        idle_percentage: idlePct,
      }),
      JSON.stringify(Object.entries(totals.apps)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, minutes]) => ({ name, minutes }))),
      JSON.stringify({
        average_productivity_score: avgProductivity,
        average_focus_score: avgFocus,
        average_overall_score: avgOverall,
      }),
      reports.flatMap((report: any) => report.strengths || []).slice(0, 8),
      reports.flatMap((report: any) => report.concerns || []).slice(0, 8),
      riskLabel(Math.max(0, (totals.active / 60) - 45) * 4),
      riskLabel(reports.length ? Math.max(0, 30 - totals.active / 60) * 4 : 90),
      avgOverall,
      JSON.stringify(scorecard),
      JSON.stringify({ source: "daily_report_rollup", daily_report_count: reports.length }),
    ],
  );
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
  const data = await glashOne(
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
       order by captured_at desc
       limit $2`,
      [date, memberId ? 80 : 24],
    ),
    glashQuery("select * from public.team_work_tracking_weekly_reports where week_start = $1", [range.week_start]),
    glashQuery("select * from public.team_work_tracking_self_reports where week_start = $1", [range.week_start]),
    glashQuery("select * from public.team_work_tracking_report_comparisons where week_start = $1", [range.week_start]),
    glashQuery("select * from public.team_work_tracking_report_access_log order by created_at desc limit 30"),
    glashMaybeOne("select * from public.team_work_tracking_settings where id = 1 limit 1"),
  ]);

  const filteredSnapshots = (snapshots || []).filter((snapshot: any) => !memberId || snapshot.team_member_id === memberId);
  const snapshotRows = filteredSnapshots.map((snapshot: any) => ({
    ...snapshot,
    screenshot_url: screenshotAccess ? null : null,
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
      const expired = await glashQuery<{ id: string }>(
        `select id from public.team_work_tracking_snapshots
         where expires_at < now() and screenshot_storage_path is not null
         limit 150`,
      );
      if (expired.length) {
        await glashQuery(
          `update public.team_work_tracking_snapshots
           set screenshot_storage_path = null,
               thumbnail_storage_path = null,
               metadata = metadata || $1::jsonb
           where id = any($2::uuid[])`,
          [JSON.stringify({ raw_screenshot_deleted: true, deleted_at: new Date().toISOString() }), expired.map((row) => row.id)],
        );
      }
      await logAccess(session!, {
        action: "purge_expired_screenshots",
        reportType: "retention",
        metadata: { count: expired.length },
      });
      return NextResponse.json({ ok: true, deleted: expired.length });
    }

    if (action === "update_settings") {
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
