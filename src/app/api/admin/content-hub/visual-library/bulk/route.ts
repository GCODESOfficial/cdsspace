import { NextRequest, NextResponse } from "next/server";
import { glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import { requireContentHub } from "@/lib/content-hub/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION_STATUS: Record<string, "available" | "used" | "archived"> = {
  available: "available",
  used: "used",
  archive: "archived",
  archived: "archived",
};

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest) {
  const { session, deny } = await requireContentHub("content_hub.visual_library");
  if (deny) return deny;

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? Array.from(new Set(body.ids.map((id: unknown) => str(id)).filter((id: string) => UUID.test(id)))).slice(0, 200)
    : [];
  const status = ACTION_STATUS[str(body.action)];

  if (!ids.length) return NextResponse.json({ ok: false, error: "Select at least one visual asset." }, { status: 400 });
  if (!status) return NextResponse.json({ ok: false, error: "Choose a valid bulk action." }, { status: 400 });

  const now = new Date().toISOString();
  const rows = await glashQuery<{ id: string }>(
    `update public.content_visual_assets
      set status = $1,
          used_at = case when $1 = 'used' then $2::timestamptz when $1 = 'available' then null else used_at end,
          archived_at = case when $1 = 'archived' then $2::timestamptz when $1 = 'available' then null else archived_at end,
          used_in_content_id = case when $1 = 'available' then null else used_in_content_id end,
          updated_at = $2::timestamptz
      where id = any($3::uuid[])
      returning id`,
    [status, now, ids],
  );

  await logActivity({
    action: `content.visual_library.bulk_${status}`,
    page: "content-hub",
    resource_type: "visual_asset",
    resource_label: `${rows.length} visual asset${rows.length === 1 ? "" : "s"} updated`,
    metadata: { status, count: rows.length, updated_by: session!.name },
  });

  return NextResponse.json({ ok: true, count: rows.length });
}
