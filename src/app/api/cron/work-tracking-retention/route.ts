/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Work-tracking screenshot retention worker.
 *
 * Raw screenshots auto-destroy after their retention window (7 days by
 * default). This cron guarantees that BEFORE a member's screenshots are
 * purged, the system has generated the daily + weekly automatic reports that
 * summarise them - so the aggregated report survives as the durable record
 * backing the member's own report once the images are gone.
 *
 * Driven by an EXTERNAL scheduler (glashdb.com cron) - point a job at
 *   GET https://<your-domain>/api/cron/work-tracking-retention
 * once a day is plenty (screenshots expire on a 7-day boundary), sending
 *   Authorization: Bearer <CRON_SECRET>
 * if CRON_SECRET is configured.
 *
 * Idempotent: daily reports are only generated when missing, weekly rollups
 * upsert, and the purge is a no-op once images are already cleared.
 */
import { NextRequest, NextResponse } from "next/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { weekRange } from "@/lib/work-tracking";
import { generateDailyReport, generateWeeklyReport, purgeExpiredScreenshots } from "@/lib/work-tracking-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (dev) - allow
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

async function run() {
  // Days whose screenshots are about to be purged (expired, or expiring within
  // the next 24h) and still have raw images. These are the days we must have a
  // report for before the images vanish.
  const expiring = await glashQuery<{ team_member_id: string; work_date: string }>(
    `select distinct team_member_id, work_date
       from public.team_work_tracking_snapshots
      where screenshot_storage_path is not null
        and expires_at < now() + interval '24 hours'
      order by work_date`,
  ).catch(() => []);

  let dailyGenerated = 0;
  const weeks = new Set<string>(); // `${memberId}|${weekStart}`

  for (const row of expiring) {
    // Only generate a daily report if one isn't already on file for that day.
    const existing = await glashMaybeOne(
      `select 1 from public.team_work_tracking_daily_reports
        where team_member_id = $1 and work_date = $2 limit 1`,
      [row.team_member_id, row.work_date],
    ).catch(() => null);
    if (!existing) {
      try {
        await generateDailyReport(row.team_member_id, row.work_date);
        dailyGenerated += 1;
      } catch (err) {
        console.error("[retention] daily report failed:", row.team_member_id, row.work_date, err instanceof Error ? err.message : err);
      }
    }
    weeks.add(`${row.team_member_id}|${weekRange(row.work_date).week_start}`);
  }

  // Roll each affected member/week up into the weekly automatic report that
  // will back the member's own weekly report after the images are purged.
  let weeklyGenerated = 0;
  for (const key of weeks) {
    const [memberId, weekStart] = key.split("|");
    try {
      await generateWeeklyReport(memberId, weekStart);
      weeklyGenerated += 1;
    } catch (err) {
      console.error("[retention] weekly report failed:", memberId, weekStart, err instanceof Error ? err.message : err);
    }
  }

  // Only now that the summaries exist do we destroy the raw screenshots.
  const purged = await purgeExpiredScreenshots(500);

  return { ok: true, days_considered: expiring.length, daily_generated: dailyGenerated, weekly_generated: weeklyGenerated, screenshots_purged: purged };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await run());
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Retention worker failed." }, { status: 500 });
  }
}

// Allow POST too so schedulers that only send POST can drive it.
export async function POST(req: NextRequest) {
  return GET(req);
}
