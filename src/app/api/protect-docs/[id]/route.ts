/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import { canActorReadDoc, verifyDocPassword, hashDocPassword } from "@/lib/protect-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const password = searchParams.get("password");

  const db = supabaseAdmin as any;
  const { data: doc, error } = await db.from("team_protected_documents").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!canActorReadDoc(actor, doc)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  if (doc.password_hash) {
    if (!password || !(await verifyDocPassword(password, doc.password_hash))) {
      return NextResponse.json({ ok: false, error: "Password required", password_required: true }, { status: 403 });
    }
  }

  // Sign the stored file path for a short-lived download URL
  let signed: string | null = null;
  if (doc.file_url) {
    const { data: signedUrl } = await (db as any).storage.from("team-documents").createSignedUrl(doc.file_url, 60 * 60);
    signed = signedUrl?.signedUrl || null;
  }
  return NextResponse.json({
    ok: true,
    doc: { ...doc, has_password: !!doc.password_hash, file_path_present: !!doc.file_url, password_hash: undefined, file_signed_url: signed },
  });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin as any;
  const { data: doc } = await db.from("team_protected_documents").select("*").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!canActorReadDoc(actor, doc) && !actor.is_admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const patch: Record<string, any> = {};
  for (const k of ["title", "description", "kind", "visibility", "allowed_department", "specific_member_ids", "body"]) {
    if (k in body) patch[k] = body[k];
  }
  if (typeof body.password === "string" && body.password.length) {
    patch.password_hash = await hashDocPassword(body.password);
  } else if (body.password === null) {
    patch.password_hash = null;
  }
  const { error } = await db.from("team_protected_documents").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = supabaseAdmin as any;
  const { data: doc } = await db.from("team_protected_documents").select("*").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!actor.is_admin && (actor.kind !== "team" || doc.uploaded_by !== actor.id)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (doc.file_url) {
    await (db as any).storage.from("team-documents").remove([doc.file_url]);
  }
  await db.from("team_protected_documents").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
