/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { glashQuery, glashMaybeOne } from "@/lib/glashdb/postgres";
import { notifyTeamMember } from "@/lib/notify-team";
import { logActivity } from "@/lib/activity-log";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { REMINDER_OFFSETS } from "@/lib/content-hub/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}
function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.map((x) => str(x)).filter(Boolean)));
}

async function getItem(id: string) {
  return glashMaybeOne<any>(`select * from public.content_items where id = $1`, [id]);
}

// The permission a status transition needs.
function permForStatus(status: string): string {
  if (status === "approved") return "content_hub.approve";
  if (status === "scheduled") return "content_hub.schedule";
  if (status === "published") return "content_hub.publish";
  return "content_hub"; // archived / draft / pending
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { deny } = await requireContentHub();
  if (deny) return deny;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  const item = await getItem(id);
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const media = await glashQuery<any>(
    `select * from public.content_media where content_id = $1 order by position asc, created_at asc`,
    [id],
  );
  return NextResponse.json({ ok: true, item: { ...item, media } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const newStatus = str(body.status);

  // Pick the permission this edit needs: a status change uses the status'
  // permission; otherwise a content edit needs create rights.
  const needed = newStatus ? permForStatus(newStatus) : "content_hub.create";
  const { session, deny } = await requireContentHub(needed);
  if (deny) return deny;

  const existing = await getItem(id);
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Approved content is locked from content edits unless the editor can approve.
  const lockedStatuses = ["approved", "scheduled", "published"];
  const editsContent = ["title", "body", "platforms", "content_type", "category", "cta_label", "cta_url", "hashtags"].some(
    (k) => k in body,
  );
  if (editsContent && lockedStatuses.includes(existing.status)) {
    const { deny: lockDeny } = await requireContentHub("content_hub.approve");
    if (lockDeny) {
      return NextResponse.json(
        { ok: false, error: "This content is approved and locked. You need approve rights to edit it." },
        { status: 403 },
      );
    }
  }

  // Build a dynamic update set from the provided fields only.
  const sets: string[] = [];
  const vals: any[] = [];
  let p = 0;
  const set = (col: string, val: any) => { sets.push(`${col} = $${++p}`); vals.push(val); };

  const textFields = ["title", "body", "category", "content_type", "cta_label", "cta_url", "cta_type",
    "scheduled_platform", "assigned_publisher_id", "assigned_publisher_name", "campaign", "series",
    "posted_url", "performance_notes"];
  for (const f of textFields) if (f in body) set(f, str(body[f]) || null);
  for (const f of ["platforms", "hashtags", "tags"]) if (f in body) set(f, strArr(body[f]));
  for (const f of ["reach", "engagement", "leads"]) {
    if (f in body) set(f, Number.isFinite(Number(body[f])) ? Number(body[f]) : null);
  }
  if ("scheduled_at" in body) set("scheduled_at", str(body.scheduled_at) || null);
  if ("ai_meta" in body && body.ai_meta && typeof body.ai_meta === "object") set("ai_meta", body.ai_meta);

  if (newStatus && ["draft", "pending", "approved", "scheduled", "published", "archived"].includes(newStatus)) {
    set("status", newStatus);
    if (newStatus === "approved") {
      set("approved_by", session!.name);
      set("approved_at", new Date().toISOString());
    }
    if (newStatus === "published") set("published_at", new Date().toISOString());
  }

  if (sets.length === 0) return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  set("updated_at", new Date().toISOString());
  vals.push(id);

  const [item] = await glashQuery<any>(
    `update public.content_items set ${sets.join(", ")} where id = $${++p} returning *`,
    vals,
  );

  // Rebuild reminders when (re)scheduled.
  const scheduledChanged = "scheduled_at" in body || newStatus === "scheduled";
  if (item.status === "scheduled" && item.scheduled_at && scheduledChanged) {
    await glashQuery(`delete from public.content_reminders where content_id = $1 and sent_at is null`, [id]);
    const offsets = strArr(body.reminder_offsets);
    const channels = strArr(body.reminder_channels);
    const now = Date.now();
    const scheduled = new Date(item.scheduled_at).getTime();
    for (const offset of (offsets.length ? offsets : ["24h", "1h", "15m", "due"])) {
      const def = REMINDER_OFFSETS.find((o) => o.value === offset);
      if (!def) continue;
      const fire = scheduled - def.minutesBefore * 60_000;
      if (fire <= now) continue;
      await glashQuery(
        `insert into public.content_reminders (content_id, offset_label, fire_at, channels) values ($1,$2,$3,$4)`,
        [id, offset, new Date(fire).toISOString(), channels.length ? channels : ["dashboard", "email"]],
      );
    }
    if (item.assigned_publisher_id) {
      await notifyTeamMember({
        recipient_id: item.assigned_publisher_id,
        kind: "content_assigned",
        title: "Content scheduled for you",
        body: `"${item.title}" is scheduled for ${new Date(item.scheduled_at).toLocaleString()}.`,
        link: `/admin/content-hub/library?id=${id}`,
        actor_is_admin: true,
      });
    }
  }

  await logActivity({
    action: newStatus ? `content.${newStatus === "approved" ? "approve" : newStatus === "published" ? "publish" : newStatus === "scheduled" ? "schedule" : newStatus === "archived" ? "archive" : "update"}` : "content.update",
    page: "content-hub",
    resource_type: "content",
    resource_id: id,
    resource_label: item.title,
    metadata: { status: item.status },
  });

  return NextResponse.json({ ok: true, item });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { deny } = await requireContentHub("content_hub.create");
  if (deny) return deny;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  const item = await getItem(id);
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  // Soft delete - keep the row for the audit trail.
  await glashQuery(`update public.content_items set status = 'deleted', updated_at = now() where id = $1`, [id]);
  await glashQuery(`delete from public.content_reminders where content_id = $1 and sent_at is null`, [id]);
  await logActivity({
    action: "content.delete",
    page: "content-hub",
    resource_type: "content",
    resource_id: id,
    resource_label: item.title,
  });
  return NextResponse.json({ ok: true });
}
