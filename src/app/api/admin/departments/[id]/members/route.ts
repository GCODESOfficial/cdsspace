/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

async function verifyAdmin() {
  const store = await cookies();
  const raw = store.get("admin_session")?.value;
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s.role === "super_admin" || s.role === "sub_admin" ? s : null;
  } catch {
    return null;
  }
}

// GET — list members of a department
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_members")
    .select("id, full_name, email, username, role_title, avatar_url, is_active")
    .eq("department_id", id)
    .order("full_name");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, members: data || [] });
}

// POST — assign members to this department (DB trigger syncs the chat thread)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { member_ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(member_ids) || member_ids.length === 0) {
    return NextResponse.json({ ok: false, error: "member_ids required" }, { status: 400 });
  }
  const db = supabaseAdmin as any;
  const { data: dep } = await db.from("departments").select("name").eq("id", id).maybeSingle();
  if (!dep) return NextResponse.json({ ok: false, error: "Department not found" }, { status: 404 });

  const { error } = await db
    .from("team_members")
    .update({ department_id: id, department: dep.name })
    .in("id", member_ids);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove members from the department (body: { member_ids: [] })
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { member_ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(member_ids) || member_ids.length === 0) {
    return NextResponse.json({ ok: false, error: "member_ids required" }, { status: 400 });
  }
  const db = supabaseAdmin as any;
  const { error } = await db
    .from("team_members")
    .update({ department_id: null, department: null })
    .in("id", member_ids)
    .eq("department_id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
