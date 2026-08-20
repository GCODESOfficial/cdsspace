import { NextRequest, NextResponse } from "next/server";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { glashQuery } from "@/lib/glashdb/postgres";
import { listConnectionSummaries } from "@/lib/social/connections";
import { publishContentToPlatform } from "@/lib/social/publish";
import type { SocialPlatform } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: every auto-post schedule joined to its content, plus channel summary.
export async function GET() {
  const { deny } = await requireContentHub("content_hub.view");
  if (deny) return deny;
  const [schedules, channels] = await Promise.all([
    glashQuery(
      `select s.id, s.content_id, s.platform, s.scheduled_for, s.status, s.error,
              s.publication_id, s.created_by, s.created_at,
              ci.title as content_title,
              pub.external_url
         from public.content_social_schedules s
         join public.content_items ci on ci.id = s.content_id
         left join public.content_publications pub
                on pub.content_id = s.content_id and pub.platform = s.platform and pub.status = 'published'
        where ci.status <> 'deleted'
        order by
          case s.status when 'pending' then 0 when 'failed' then 1 when 'published' then 2 else 3 end,
          s.scheduled_for desc
        limit 300`,
    ),
    listConnectionSummaries(),
  ]);
  return NextResponse.json({ ok: true, schedules, channels });
}

// POST { action: "run_due" }: fire every due pending schedule immediately
// (same work the cron does) so an admin doesn't have to wait for the interval.
export async function POST(req: NextRequest) {
  const { session, deny } = await requireContentHub("content_hub.publish");
  if (deny || !session) return deny || NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action !== "run_due") return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });

  const due = await glashQuery<{ id: string; content_id: string; platform: SocialPlatform }>(
    `select id, content_id, platform from public.content_social_schedules
      where status = 'pending' and scheduled_for <= now() order by scheduled_for asc limit 50`,
  );
  let published = 0, failed = 0;
  for (const row of due) {
    try {
      const result = await publishContentToPlatform({ contentId: row.content_id, platform: row.platform, actor: session.email, trigger: "scheduled" });
      const status = result.status === "failed" ? "failed" : "published";
      if (status === "published") published += 1; else failed += 1;
      await glashQuery(`update public.content_social_schedules set status=$2, error=$3, updated_at=now() where id=$1`, [row.id, status, result.error || null]);
    } catch (error) {
      failed += 1;
      await glashQuery(`update public.content_social_schedules set status='failed', error=$2, updated_at=now() where id=$1`, [row.id, error instanceof Error ? error.message.slice(0, 1000) : "Publish failed."]);
    }
  }
  return NextResponse.json({ ok: true, ran: due.length, published, failed });
}

// DELETE { schedule_id }: cancel a pending schedule.
export async function DELETE(req: NextRequest) {
  const { deny } = await requireContentHub("content_hub.schedule");
  if (deny) return deny;
  const body = await req.json().catch(() => ({}));
  const scheduleId = typeof body.schedule_id === "string" ? body.schedule_id : "";
  if (!scheduleId) return NextResponse.json({ ok: false, error: "Missing schedule id." }, { status: 400 });
  await glashQuery(`update public.content_social_schedules set status='canceled', updated_at=now() where id=$1 and status='pending'`, [scheduleId]);
  return NextResponse.json({ ok: true });
}
