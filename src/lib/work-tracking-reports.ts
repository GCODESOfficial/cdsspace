/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Work-tracking report generators + screenshot retention.
 *
 * Shared by the admin work-tracking API (manual "Generate report" / "Purge"
 * actions) and the retention cron (which generates the weekly backing report
 * for a member BEFORE their raw screenshots expire, then purges them).
 */
import { chatComplete } from "@/lib/ai/openai";
import { glashMaybeOne, glashOne, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";
import {
  DEFAULT_CAPTURE_INTERVAL_SECONDS,
  WORK_TRACKING_BUCKET,
  aggregateSnapshots,
  parseJsonObject,
  uniqueStrings,
  weekRange,
} from "@/lib/work-tracking";

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

export async function generateDailyReport(memberId: string, date: string) {
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

export async function generateWeeklyReport(memberId: string, weekStart: string) {
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

/**
 * Delete the raw screenshot objects for snapshots whose retention window has
 * passed, and clear their storage paths. Metadata/analysis rows are kept (the
 * weekly report is what backs the member's report once the images are gone).
 * Returns the number of snapshots purged.
 */
export async function purgeExpiredScreenshots(limit = 500) {
  const expired = await glashQuery<{ id: string; screenshot_storage_path: string | null; thumbnail_storage_path: string | null }>(
    `select id, screenshot_storage_path, thumbnail_storage_path
     from public.team_work_tracking_snapshots
     where expires_at < now() and screenshot_storage_path is not null
     limit $1`,
    [limit],
  );
  if (!expired.length) return 0;

  const paths = expired
    .flatMap((row) => [row.screenshot_storage_path, row.thumbnail_storage_path])
    .filter((p): p is string => !!p);
  if (paths.length) {
    try {
      await (getGlashDbAdmin() as any).storage.from(WORK_TRACKING_BUCKET).remove(paths);
    } catch (err) {
      console.error("[work-tracking] storage purge failed:", err instanceof Error ? err.message : err);
    }
  }
  await glashQuery(
    `update public.team_work_tracking_snapshots
     set screenshot_storage_path = null,
         thumbnail_storage_path = null,
         metadata = metadata || $1::jsonb
     where id = any($2::uuid[])`,
    [JSON.stringify({ raw_screenshot_deleted: true, deleted_at: new Date().toISOString() }), expired.map((row) => row.id)],
  );
  return expired.length;
}
