/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { glashQuery } from "@/lib/glashdb/postgres";
import { notifyTeamMember } from "@/lib/notify-team";
import { logActivity } from "@/lib/activity-log";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { REMINDER_OFFSETS } from "@/lib/content-hub/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}
function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.map((x) => str(x)).filter(Boolean)));
}

// Attach media rows to their content items.
async function withMedia(items: any[]): Promise<any[]> {
  if (items.length === 0) return items;
  const ids = items.map((i) => i.id);
  const media = await glashQuery<any>(
    `select * from public.content_media where content_id = any($1::uuid[]) order by position asc, created_at asc`,
    [ids],
  );
  const byContent = new Map<string, any[]>();
  for (const m of media) {
    const list = byContent.get(m.content_id) || [];
    list.push(m);
    byContent.set(m.content_id, list);
  }
  return items.map((i) => ({ ...i, media: byContent.get(i.id) || [] }));
}

// GET /api/admin/content-hub?status=&type=&platform=&publisher=&search=&from=&to=
export async function GET(req: NextRequest) {
  const { deny } = await requireContentHub();
  if (deny) return deny;

  const url = new URL(req.url);
  const status = str(url.searchParams.get("status"));
  const type = str(url.searchParams.get("type"));
  const platform = str(url.searchParams.get("platform"));
  const publisher = str(url.searchParams.get("publisher"));
  const search = str(url.searchParams.get("search"));
  const campaign = str(url.searchParams.get("campaign"));
  const series = str(url.searchParams.get("series"));
  const from = str(url.searchParams.get("from"));
  const to = str(url.searchParams.get("to"));
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200));

  const where: string[] = ["status <> 'deleted'"];
  const params: any[] = [];
  let p = 0;

  if (status) {
    // Support comma list, e.g. status=draft,pending
    const list = status.split(",").map((s) => s.trim()).filter(Boolean);
    params.push(list);
    where.push(`status = any($${++p}::text[])`);
  }
  if (type) { params.push(type); where.push(`content_type = $${++p}`); }
  if (platform) { params.push(platform); where.push(`$${++p} = any(platforms)`); }
  if (publisher) { params.push(publisher); where.push(`assigned_publisher_id = $${++p}`); }
  if (campaign) { params.push(campaign); where.push(`campaign = $${++p}`); }
  if (series) { params.push(series); where.push(`series = $${++p}`); }
  if (from) { params.push(from); where.push(`scheduled_at >= $${++p}`); }
  if (to) { params.push(to); where.push(`scheduled_at <= $${++p}`); }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(lower(title) like $${++p} or lower(body) like $${p} or lower(coalesce(campaign,'')) like $${p} or $${p} = any(array(select lower(t) from unnest(tags) t)))`);
  }
  params.push(limit);

  const rows = await glashQuery<any>(
    `select * from public.content_items
      where ${where.join(" and ")}
      order by coalesce(scheduled_at, created_at) desc
      limit $${++p}`,
    params,
  );
  const items = await withMedia(rows);
  return NextResponse.json({ ok: true, items });
}

// Build reminder rows for a scheduled item (only future fire times).
function buildReminders(contentId: string, scheduledAtIso: string, offsets: string[], channels: string[]) {
  const scheduled = new Date(scheduledAtIso).getTime();
  const now = Date.now();
  const rows: { content_id: string; offset_label: string; fire_at: string; channels: string[] }[] = [];
  for (const offset of offsets) {
    const def = REMINDER_OFFSETS.find((o) => o.value === offset);
    if (!def) continue;
    const fire = scheduled - def.minutesBefore * 60_000;
    if (fire <= now) continue; // don't schedule reminders in the past
    rows.push({
      content_id: contentId,
      offset_label: offset,
      fire_at: new Date(fire).toISOString(),
      channels: channels.length ? channels : ["dashboard"],
    });
  }
  return rows;
}

// POST /api/admin/content-hub  - create a content item (from the wizard).
export async function POST(req: NextRequest) {
  const { session, deny } = await requireContentHub("content_hub.create");
  if (deny) return deny;

  const body = await req.json().catch(() => ({}));
  const title = str(body.title);
  if (title.length < 2) {
    return NextResponse.json({ ok: false, error: "A title is required." }, { status: 400 });
  }

  const status = ["draft", "pending", "approved", "scheduled"].includes(str(body.status))
    ? str(body.status)
    : "draft";
  const scheduledAt = str(body.scheduled_at) || null;
  if (status === "scheduled" && !scheduledAt) {
    return NextResponse.json({ ok: false, error: "Pick a date & time to schedule." }, { status: 400 });
  }

  const [item] = await glashQuery<any>(
    `insert into public.content_items
       (title, body, source, category, content_type, platforms, cta_label, cta_url, cta_type,
        hashtags, status, scheduled_at, scheduled_platform, assigned_publisher_id, assigned_publisher_name,
        campaign, series, tags, ai_meta, created_by, created_by_id,
        approved_by, approved_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     returning *`,
    [
      title,
      str(body.body),
      ["manual", "ai", "image", "video", "bsd"].includes(str(body.source)) ? str(body.source) : "manual",
      str(body.category) || null,
      str(body.content_type) || null,
      strArr(body.platforms),
      str(body.cta_label) || null,
      str(body.cta_url) || null,
      str(body.cta_type) || null,
      strArr(body.hashtags),
      status,
      scheduledAt,
      str(body.scheduled_platform) || null,
      str(body.assigned_publisher_id) || null,
      str(body.assigned_publisher_name) || null,
      str(body.campaign) || null,
      str(body.series) || null,
      strArr(body.tags),
      body.ai_meta && typeof body.ai_meta === "object" ? body.ai_meta : {},
      session!.name,
      session!.memberId || session!.email,
      status === "approved" ? session!.name : null,
      status === "approved" ? new Date().toISOString() : null,
    ],
  );

  // Media attachments.
  const media = Array.isArray(body.media) ? body.media : [];
  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    if (!str(m?.url)) continue;
    await glashQuery(
      `insert into public.content_media
         (content_id, url, kind, file_name, mime_type, size_bytes, thumbnail_url, position, meta)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        item.id,
        str(m.url),
        ["image", "video", "pdf", "document", "clip"].includes(str(m.kind)) ? str(m.kind) : "image",
        str(m.file_name) || null,
        str(m.mime_type) || null,
        Number.isFinite(Number(m.size_bytes)) ? Number(m.size_bytes) : null,
        str(m.thumbnail_url) || null,
        i,
        m.meta && typeof m.meta === "object" ? m.meta : {},
      ],
    );
  }

  // Reminders + publisher notification when scheduled.
  if (status === "scheduled" && scheduledAt) {
    const offsets = strArr(body.reminder_offsets);
    const channels = strArr(body.reminder_channels);
    const reminders = buildReminders(item.id, scheduledAt, offsets.length ? offsets : ["24h", "1h", "15m", "due"], channels.length ? channels : ["dashboard", "email"]);
    for (const r of reminders) {
      await glashQuery(
        `insert into public.content_reminders (content_id, offset_label, fire_at, channels)
         values ($1,$2,$3,$4)`,
        [r.content_id, r.offset_label, r.fire_at, r.channels],
      );
    }
    if (str(body.assigned_publisher_id)) {
      await notifyTeamMember({
        recipient_id: str(body.assigned_publisher_id),
        kind: "content_assigned",
        title: "New content scheduled for you",
        body: `"${title}" is scheduled for ${new Date(scheduledAt).toLocaleString()}.`,
        link: `/admin/content-hub/library?id=${item.id}`,
        actor_is_admin: true,
      });
    }
  }

  await logActivity({
    action: "content.create",
    page: "content-hub",
    resource_type: "content",
    resource_id: item.id,
    resource_label: `${title} (${status})`,
    metadata: { source: item.source, status, platforms: item.platforms },
  });

  const [withMediaItem] = await withMedia([item]);
  return NextResponse.json({ ok: true, item: withMediaItem });
}
