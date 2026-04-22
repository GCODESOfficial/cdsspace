/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

/** Materialize a template into a rendered body + increment times_used. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const { values } = await req.json().catch(() => ({}));

  const db = supabaseAdmin as any;
  const { data: tpl } = await db.from("ai_templates").select("*").eq("slug", slug).maybeSingle();
  if (!tpl) return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });

  // Substitute {{var}} placeholders
  let body = String(tpl.body_template || "");
  const vals = (values || {}) as Record<string, string>;
  body = body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k: string) => {
    const v = vals[k.toLowerCase()];
    return v?.toString() || "";
  });

  // Bump usage count (best-effort)
  await db
    .from("ai_templates")
    .update({ times_used: (tpl.times_used || 0) + 1 })
    .eq("id", tpl.id);

  // Optional AI seed prompt — resolve it too
  let seed = tpl.ai_seed_prompt || null;
  if (seed) {
    seed = seed.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_: string, k: string) => {
      const v = vals[k.toLowerCase()];
      return v?.toString() || "";
    });
  }

  return NextResponse.json({ ok: true, title: tpl.title, body, ai_seed_prompt: seed });
}
