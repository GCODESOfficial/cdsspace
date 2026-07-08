/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { glashQuery, glashMaybeOne } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import { requireContentHub } from "@/lib/content-hub/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET - publishers, settings and dashboard stats for the hub.
export async function GET() {
  const { deny } = await requireContentHub();
  if (deny) return deny;

  const [publishers, settings, statusCounts, upcoming] = await Promise.all([
    glashQuery<any>(
      `select id, full_name, role_title, department
         from public.team_members
        where is_active = true
        order by full_name asc`,
    ),
    glashMaybeOne<any>(`select * from public.content_settings where id = 1`),
    glashQuery<any>(
      `select status, count(*)::int as n from public.content_items where status <> 'deleted' group by status`,
    ),
    glashQuery<any>(
      `select id, title, scheduled_at, scheduled_platform, status, assigned_publisher_name, platforms
         from public.content_items
        where status = 'scheduled' and scheduled_at >= now()
        order by scheduled_at asc
        limit 8`,
    ),
  ]);

  const counts: Record<string, number> = {};
  for (const row of statusCounts) counts[row.status] = row.n;

  return NextResponse.json({
    ok: true,
    publishers,
    settings: settings || { branding: {}, reminder_offsets: ["24h", "1h", "15m", "due"], reminder_channels: ["dashboard", "email"], default_hashtags: 3, best_examples: [] },
    stats: { counts, upcoming },
  });
}

// PATCH - update hub settings (branding presets + reminder defaults).
export async function PATCH(req: NextRequest) {
  const { deny } = await requireContentHub("content_hub.settings");
  if (deny) return deny;

  const body = await req.json().catch(() => ({}));
  // Column -> value entries. `newColumns` are added by the AI-defaults migration
  // (glashdb-content-ai-defaults.sql); if it hasn't run yet we retry without them
  // so saving the other settings never breaks.
  const entries: { col: string; val: any }[] = [];
  const newColumns = new Set(["default_hashtags", "best_examples"]);
  const set = (col: string, val: any) => entries.push({ col, val });

  if (body.branding && typeof body.branding === "object") set("branding", body.branding);
  if (Array.isArray(body.reminder_offsets)) set("reminder_offsets", body.reminder_offsets.map(String));
  if (Array.isArray(body.reminder_channels)) set("reminder_channels", body.reminder_channels.map(String));
  if ("default_publisher_id" in body) set("default_publisher_id", body.default_publisher_id || null);
  if ("default_hashtags" in body) {
    const n = Math.max(0, Math.min(30, parseInt(String(body.default_hashtags), 10) || 0));
    set("default_hashtags", n);
  }
  if (Array.isArray(body.best_examples)) {
    // Curated best-performing posts used as AI style references. Cleaned + capped.
    const cleaned = body.best_examples
      .map((e: any) => ({
        text: String(e?.text || "").slice(0, 4000),
        platform: String(e?.platform || "").slice(0, 40),
        note: String(e?.note || "").slice(0, 400),
      }))
      .filter((e: any) => e.text.trim())
      .slice(0, 50);
    // jsonb column: pass a JSON string so Postgres parses it as jsonb (a JS array
    // would be coerced to a Postgres array literal and fail the cast).
    set("best_examples", JSON.stringify(cleaned));
  }

  if (entries.length === 0) return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });

  const runUpdate = async (cols: { col: string; val: any }[]) => {
    const withStamp = [...cols, { col: "updated_at", val: new Date().toISOString() }];
    const setSql = withStamp.map((e, i) => `${e.col} = $${i + 1}`).join(", ");
    const vals = withStamp.map((e) => e.val);
    const rows = await glashQuery<any>(`update public.content_settings set ${setSql} where id = 1 returning *`, vals);
    return rows[0];
  };

  let settings: any;
  try {
    settings = await runUpdate(entries);
  } catch (err: any) {
    // Most likely the AI-defaults columns don't exist yet — retry without them so
    // branding/reminder settings still save.
    const hasNew = entries.some((e) => newColumns.has(e.col));
    if (hasNew && /column|does not exist|default_hashtags|best_examples/i.test(String(err?.message))) {
      settings = await runUpdate(entries.filter((e) => !newColumns.has(e.col)));
    } else {
      throw err;
    }
  }
  await logActivity({
    action: "content_settings.update",
    page: "content-hub",
    resource_type: "content_settings",
    resource_label: "Content Hub settings",
  });
  return NextResponse.json({ ok: true, settings });
}
