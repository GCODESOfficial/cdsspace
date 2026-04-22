/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

function isMemberAllowed(doc: any, session: { id: string; department: string | null }) {
  if (doc.visibility === "all_team") return true;
  if (doc.visibility === "department" && doc.allowed_department && session.department === doc.allowed_department) return true;
  if (doc.visibility === "specific_members" && Array.isArray(doc.allowed_member_ids) && doc.allowed_member_ids.includes(session.id)) return true;
  return false;
}

// GET — list documents visible to the current actor
export async function GET() {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const db = supabaseAdmin as any;

  const admin = await getAdminSession();
  if (admin) {
    const { data } = await db
      .from("team_protected_documents")
      .select("*")
      .order("created_at", { ascending: false });
    return NextResponse.json({ ok: true, actor: "admin", documents: data || [] });
  }

  const team = await getTeamSession();
  if (!team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data } = await db
    .from("team_protected_documents")
    .select("*")
    .order("created_at", { ascending: false });

  const visible = (data || []).filter((d: any) => isMemberAllowed(d, team));
  return NextResponse.json({ ok: true, actor: "team", documents: visible });
}

// POST — admin creates a protected document
export async function POST(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const {
    title,
    description,
    file_url,
    file_size_bytes,
    visibility,
    allowed_department,
    allowed_member_ids,
    password,
  } = await req.json().catch(() => ({}));

  if (!title?.trim() || !file_url?.trim()) {
    return NextResponse.json({ ok: false, error: "Title and file URL are required" }, { status: 400 });
  }

  let password_hash: string | null = null;
  let password_salt: string | null = null;
  if (password && String(password).trim()) {
    password_salt = crypto.randomBytes(16).toString("hex");
    password_hash = crypto
      .createHash("sha256")
      .update(String(password).trim() + ":" + password_salt)
      .digest("hex");
  }

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_protected_documents")
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      file_url: file_url.trim(),
      file_size_bytes: file_size_bytes || null,
      visibility: visibility || "all_team",
      allowed_department: allowed_department || null,
      allowed_member_ids: Array.isArray(allowed_member_ids) ? allowed_member_ids : null,
      password_hash,
      password_salt,
      uploaded_by_admin: true,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// PATCH — admin updates
export async function PATCH(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, ...patch } = body;
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const allowed = ["title", "description", "visibility", "allowed_department", "allowed_member_ids"];
  const updates: Record<string, any> = {};
  for (const k of allowed) if (k in patch) updates[k] = patch[k];

  const db = supabaseAdmin as any;
  const { error } = await db.from("team_protected_documents").update(updates).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — admin removes
export async function DELETE(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const db = supabaseAdmin as any;
  const { error } = await db.from("team_protected_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
