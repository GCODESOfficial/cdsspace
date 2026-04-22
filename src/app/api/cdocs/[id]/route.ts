/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canTouchDoc(actor: any, docId: string) {
  if (actor.is_admin) return true;
  const db = supabaseAdmin as any;
  const { data } = await db.from("team_cdocs").select("created_by").eq("id", docId).maybeSingle();
  if (!data) return false;
  return data.created_by === actor.id;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!(await canTouchDoc(actor, id))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const db = supabaseAdmin as any;
  const { data, error } = await db.from("team_cdocs").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, doc: data });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!(await canTouchDoc(actor, id))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};
  const allowed = ["title", "body", "theme", "department", "tags", "category", "subcategory", "archived", "stamped", "is_template"];
  for (const k of allowed) if (k in body) patch[k] = body[k];
  patch.last_saved_at = new Date().toISOString();
  if (body.archived !== undefined) patch.archived_at = body.archived ? new Date().toISOString() : null;

  const db = supabaseAdmin as any;
  const { data, error } = await db.from("team_cdocs").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const action = body.archived === true ? "archived" : body.archived === false ? "unarchived" : body.title !== undefined ? "renamed" : "edited";
  await db.from("team_cdocs_activity").insert({
    cdoc_id: id,
    actor_member_id: actor.kind === "team" ? actor.id : null,
    actor_is_admin: actor.is_admin,
    actor_name: actor.name,
    action,
    detail: body.title || null,
  });

  return NextResponse.json({ ok: true, doc: data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!(await canTouchDoc(actor, id))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const db = supabaseAdmin as any;

  // Block delete if any signed requests reference this doc
  const { count: signedCount } = await db
    .from("team_signature_requests")
    .select("id", { count: "exact", head: true })
    .eq("document_id", id)
    .eq("status", "signed");
  if ((signedCount || 0) > 0) {
    return NextResponse.json({ ok: false, error: "This document has signed requests and cannot be deleted. Archive instead." }, { status: 409 });
  }
  const { error } = await db.from("team_cdocs").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
