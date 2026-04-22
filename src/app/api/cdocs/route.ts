/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shareToken() {
  return crypto.randomBytes(16).toString("hex");
}

export async function GET(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const archived = searchParams.get("archived") === "true";
  const templates = searchParams.get("templates") === "true";
  const category = searchParams.get("category");

  const db = supabaseAdmin as any;
  let q = db
    .from("team_cdocs")
    .select("id, title, body, theme, department, tags, archived, is_template, stamped, share_token, category, subcategory, last_saved_at, created_at, updated_at, created_by, created_by_admin")
    .eq("archived", archived)
    .order("updated_at", { ascending: false });
  if (templates) q = q.eq("is_template", true);
  else q = q.eq("is_template", false);
  if (category) q = q.eq("category", category);
  // Team members see their own + public templates; admin sees all
  if (actor.kind === "team") {
    if (templates) {
      // Templates: their own + all admin-authored templates
      q = q.or(`created_by.eq.${actor.id},created_by_admin.eq.true`);
    } else {
      q = q.eq("created_by", actor.id);
    }
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, docs: data || [] });
}

export async function POST(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin as any;

  const row = {
    title: body.title?.trim() || "Untitled",
    body: body.body || "",
    theme: body.theme || "light",
    department: body.department || null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    category: body.category || null,
    subcategory: body.subcategory || null,
    is_template: !!body.is_template,
    stamped: !!body.stamped,
    share_token: shareToken(),
    created_by: actor.kind === "team" ? actor.id : null,
    created_by_admin: actor.kind === "admin",
  };

  const { data, error } = await db.from("team_cdocs").insert(row).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await db.from("team_cdocs_activity").insert({
    cdoc_id: data.id,
    actor_member_id: actor.kind === "team" ? actor.id : null,
    actor_is_admin: actor.is_admin,
    actor_name: actor.name,
    action: "created",
    detail: data.title,
  });

  return NextResponse.json({ ok: true, doc: data });
}
