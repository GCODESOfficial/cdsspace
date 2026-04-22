/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import { canActorReadDoc, hashDocPassword } from "@/lib/protect-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_protected_documents")
    .select("id, title, description, kind, visibility, allowed_department, allowed_member_ids, specific_member_ids, file_url, file_mime, file_size_bytes, password_hash, uploaded_by, uploaded_by_admin, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const visible = (data || []).filter((d: any) => canActorReadDoc(actor, d)).map((d: any) => ({
    ...d,
    has_password: !!d.password_hash,
    file_path_present: !!d.file_url,
    password_hash: undefined,
  }));
  return NextResponse.json({ ok: true, docs: visible });
}

export async function POST(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const contentType = req.headers.get("content-type") || "";
  const db = supabaseAdmin as any;

  let fields: Record<string, any> = {};
  let fileBuffer: ArrayBuffer | null = null;
  let fileName: string | null = null;
  let fileMime: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    for (const [k, v] of form.entries()) {
      if (v instanceof File) {
        fileBuffer = await v.arrayBuffer();
        fileName = v.name;
        fileMime = v.type || "application/octet-stream";
      } else {
        fields[k] = v;
      }
    }
  } else {
    fields = await req.json();
  }

  const { title, description, kind, visibility, allowed_department, specific_member_ids, password, body } = fields;
  if (!title?.trim()) return NextResponse.json({ ok: false, error: "Title required" }, { status: 400 });

  let file_url: string | null = null;
  let file_size_bytes: number | null = null;
  if (fileBuffer && fileName) {
    const bucket = "team-documents";
    const path = `${Date.now()}-${(fileName || "file").replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
    const { error: upErr } = await (db as any).storage.from(bucket).upload(path, new Uint8Array(fileBuffer), {
      contentType: fileMime || "application/octet-stream",
      upsert: false,
    });
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    file_url = path;
    file_size_bytes = fileBuffer.byteLength;
  }

  const password_hash = password ? await hashDocPassword(String(password)) : null;
  const row: any = {
    title: String(title).trim(),
    description: description || null,
    kind: kind || "generic",
    visibility: visibility || "all_team",
    allowed_department: allowed_department || null,
    specific_member_ids: Array.isArray(specific_member_ids) ? specific_member_ids : (specific_member_ids ? JSON.parse(String(specific_member_ids)) : []),
    body: body || null,
    file_url,
    file_mime: fileMime,
    file_size_bytes,
    password_hash,
    uploaded_by: actor.kind === "team" ? actor.id : null,
    uploaded_by_admin: actor.is_admin,
  };
  const { data, error } = await db.from("team_protected_documents").insert(row).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    doc: { ...data, has_password: !!data.password_hash, file_path_present: !!data.file_url, password_hash: undefined },
  });
}
