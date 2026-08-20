/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import { requireContentHub } from "@/lib/content-hub/api-auth";

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

async function getAsset(id: string) {
  return glashMaybeOne<any>(`select * from public.content_visual_assets where id = $1`, [id]);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { deny } = await requireContentHub();
  if (deny) return deny;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });

  const item = await getAsset(id);
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, deny } = await requireContentHub("content_hub.visual_library");
  if (deny) return deny;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });

  const existing = await getAsset(id);
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: any[] = [];
  let p = 0;
  const set = (col: string, val: any) => { sets.push(`${col} = $${++p}`); vals.push(val); };

  if ("title" in body) set("title", str(body.title) || null);
  if ("notes" in body) set("notes", str(body.notes) || null);
  if ("tags" in body) set("tags", strArr(body.tags));
  if ("thumbnail_url" in body) set("thumbnail_url", str(body.thumbnail_url) || null);
  if ("meta" in body && body.meta && typeof body.meta === "object") set("meta", body.meta);

  const status = str(body.status);
  if (status && ["available", "used", "archived"].includes(status)) {
    set("status", status);
    if (status === "used") {
      set("used_at", new Date().toISOString());
      set("archived_at", null);
      set("used_in_content_id", UUID.test(str(body.used_in_content_id)) ? str(body.used_in_content_id) : null);
    }
    if (status === "archived") {
      set("archived_at", new Date().toISOString());
    }
    if (status === "available") {
      set("used_at", null);
      set("archived_at", null);
      set("used_in_content_id", null);
    }
  }

  if (sets.length === 0) return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  set("updated_at", new Date().toISOString());
  vals.push(id);

  const [item] = await glashQuery<any>(
    `update public.content_visual_assets set ${sets.join(", ")} where id = $${++p} returning *`,
    vals,
  );

  await logActivity({
    action: status ? `content.visual_library.${status}` : "content.visual_library.update",
    page: "content-hub",
    resource_type: "visual_asset",
    resource_id: id,
    resource_label: item.title || item.file_name || existing.file_name || "Visual asset",
    metadata: { status: item.status, updated_by: session!.name },
  });

  return NextResponse.json({ ok: true, item });
}
