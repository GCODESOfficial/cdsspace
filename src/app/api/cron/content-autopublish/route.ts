/**
 * Auto-publish worker for the Content Hub.
 *
 * Point an external scheduler (glashdb.com cron) at:
 *   GET https://<domain>/api/cron/content-autopublish
 * every few minutes, sending `Authorization: Bearer <CRON_SECRET>` when
 * CRON_SECRET is set. It publishes every scheduled content item whose time has
 * arrived to the connected channels it targets (LinkedIn today; Facebook,
 * Instagram, TikTok, X once their providers are enabled).
 *
 * Idempotent: publishContentToPlatform skips a platform already published, and
 * items are advanced to 'published' once attempted so a re-run never double-posts.
 */
import { NextRequest, NextResponse } from "next/server";
import { glashQuery } from "@/lib/glashdb/postgres";
import { listConnectionSummaries } from "@/lib/social/connections";
import { publishContentToPlatform } from "@/lib/social/publish";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured -> open (matches other crons)
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const channels = await listConnectionSummaries();
  const connected = new Set(channels.filter((c) => c.connected).map((c) => c.platform));

  const due = await glashQuery<{ id: string; platforms: string[] | null }>(
    `select id, platforms from public.content_items
      where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
      order by scheduled_at asc
      limit 25`,
  );

  const summary: Array<{ id: string; published: number; failed: number; skipped: number }> = [];

  for (const item of due) {
    const targets = (item.platforms || [])
      .filter((p): p is SocialPlatform => (SOCIAL_PLATFORMS as string[]).includes(p) && connected.has(p as SocialPlatform));

    // No connected target yet - leave it scheduled so it goes out once a
    // matching channel is connected (no external calls made this tick).
    if (!targets.length) continue;

    let published = 0, failed = 0, skipped = 0;
    for (const platform of targets) {
      try {
        const result = await publishContentToPlatform({ contentId: item.id, platform, actor: "cron:autopublish", trigger: "scheduled" });
        if (result.status === "published") published += 1;
        else if (result.status === "skipped") skipped += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }

    // Advance out of the schedule queue after the attempt (failures stay logged
    // in content_publications; an admin can retry with "Publish now").
    await glashQuery(
      `update public.content_items set status = 'published', published_at = coalesce(published_at, now()), updated_at = now() where id = $1`,
      [item.id],
    );
    summary.push({ id: item.id, published, failed, skipped });
  }

  // Per-item, per-platform schedules set from the "Auto-schedule" control.
  const dueSchedules = await glashQuery<{ id: string; content_id: string; platform: SocialPlatform }>(
    `select id, content_id, platform from public.content_social_schedules
      where status = 'pending' and scheduled_for <= now()
      order by scheduled_for asc
      limit 50`,
  );
  let scheduleFired = 0;
  for (const row of dueSchedules) {
    try {
      const result = await publishContentToPlatform({ contentId: row.content_id, platform: row.platform, actor: "cron:schedule", trigger: "scheduled" });
      const status = result.status === "failed" ? "failed" : "published";
      await glashQuery(
        `update public.content_social_schedules set status = $2, error = $3, updated_at = now() where id = $1`,
        [row.id, status, result.error || null],
      );
    } catch (error) {
      await glashQuery(
        `update public.content_social_schedules set status = 'failed', error = $2, updated_at = now() where id = $1`,
        [row.id, error instanceof Error ? error.message.slice(0, 1000) : "Publish failed."],
      );
    }
    scheduleFired += 1;
  }

  return NextResponse.json({ ok: true, processed: summary.length, results: summary, schedules_fired: scheduleFired });
}
