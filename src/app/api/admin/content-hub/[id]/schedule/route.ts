import { NextRequest, NextResponse } from "next/server";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { glashMaybeOne, glashPool, glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import { listConnectionSummaries } from "@/lib/social/connections";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asPlatforms(value: unknown): SocialPlatform[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value.filter((p): p is SocialPlatform => typeof p === "string" && (SOCIAL_PLATFORMS as string[]).includes(p)),
  ));
}

// GET: existing schedules for this item (for the UI).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { deny } = await requireContentHub("content_hub.view");
  if (deny) return deny;
  const { id } = await params;
  const schedules = await glashQuery(
    `select id, platform, scheduled_for, status, error, publication_id, created_at
       from public.content_social_schedules
      where content_id = $1
      order by scheduled_for asc, created_at asc`,
    [id],
  );
  return NextResponse.json({ ok: true, schedules });
}

// POST: schedule the item to one or more connected platforms at a time.
// Body: { platforms: string[], scheduled_for: ISO string }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, deny } = await requireContentHub("content_hub.schedule");
  if (deny || !session) return deny || NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const platforms = asPlatforms(body.platforms);
  const when = typeof body.scheduled_for === "string" ? new Date(body.scheduled_for) : null;

  if (!platforms.length) return NextResponse.json({ ok: false, error: "Choose at least one platform." }, { status: 400 });
  if (!when || Number.isNaN(when.getTime())) return NextResponse.json({ ok: false, error: "Choose a valid date and time." }, { status: 400 });
  if (when.getTime() < Date.now() - 60_000) return NextResponse.json({ ok: false, error: "Pick a time in the future." }, { status: 400 });

  const item = await glashMaybeOne<{ id: string; title: string }>(
    `select id, title from public.content_items where id = $1 and status <> 'deleted' limit 1`, [id],
  );
  if (!item) return NextResponse.json({ ok: false, error: "Content item not found." }, { status: 404 });

  // Only allow platforms that are actually connected.
  const channels = await listConnectionSummaries();
  const connected = new Set(channels.filter((c) => c.connected).map((c) => c.platform));
  const targets = platforms.filter((p) => connected.has(p));
  const rejected = platforms.filter((p) => !connected.has(p));
  if (!targets.length) {
    return NextResponse.json({ ok: false, error: "None of the chosen platforms are connected. Connect them in Content Hub settings first." }, { status: 409 });
  }

  const client = await glashPool.connect();
  try {
    await client.query("begin");
    // Replace any existing pending schedule for these platforms with the new time.
    await client.query(
      `delete from public.content_social_schedules where content_id = $1 and platform = any($2::text[]) and status = 'pending'`,
      [id, targets],
    );
    for (const platform of targets) {
      await client.query(
        `insert into public.content_social_schedules (content_id, platform, scheduled_for, status, created_by)
         values ($1,$2,$3,'pending',$4)`,
        [id, platform, when.toISOString(), session.email],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not schedule." }, { status: 500 });
  } finally {
    client.release();
  }

  await logActivity({
    action: "content.social_schedule",
    page: "content-hub/library",
    resource_type: "content_item",
    resource_id: id,
    resource_label: item.title,
    metadata: { platforms: targets, scheduled_for: when.toISOString() },
  });

  return NextResponse.json({
    ok: true,
    scheduled: targets,
    scheduled_for: when.toISOString(),
    ignored: rejected,
  });
}

// DELETE: cancel a pending schedule row. Body: { schedule_id }.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { deny } = await requireContentHub("content_hub.schedule");
  if (deny) return deny;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const scheduleId = typeof body.schedule_id === "string" ? body.schedule_id : "";
  if (!scheduleId) return NextResponse.json({ ok: false, error: "Missing schedule id." }, { status: 400 });
  await glashQuery(
    `update public.content_social_schedules set status = 'canceled', updated_at = now()
      where id = $1 and content_id = $2 and status = 'pending'`,
    [scheduleId, id],
  );
  return NextResponse.json({ ok: true });
}
