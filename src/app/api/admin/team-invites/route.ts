/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { generateInviteToken } from "@/lib/team-auth";

export const runtime = "nodejs";

async function verifyAdmin() {
  const store = await cookies();
  const raw = store.get("admin_session")?.value;
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    return session.role === "super_admin" || session.role === "sub_admin" ? session : null;
  } catch {
    return null;
  }
}

// GET — list pending invites
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_invites")
    .select("id, token, suggested_role_title, suggested_department_id, is_sub_admin, permissions, redeemed_at, expires_at, created_at")
    .is("redeemed_at", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, invites: data || [] });
}

// POST — create a blank self-serve invite. Optional pre-filled hints.
export async function POST(req: Request) {
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { suggested_role_title, suggested_department_id, is_sub_admin, permissions } = body;

  const token = generateInviteToken();
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_invites")
    .insert({
      token,
      suggested_role_title: suggested_role_title || null,
      suggested_department_id: suggested_department_id || null,
      is_sub_admin: !!is_sub_admin,
      permissions: Array.isArray(permissions) ? permissions : [],
    })
    .select("id, token, expires_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, invite: data });
}

// DELETE — revoke a pending invite by token
export async function DELETE(req: Request) {
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { token } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });

  const db = supabaseAdmin as any;
  const { error } = await db.from("team_invites").delete().eq("token", token).is("redeemed_at", null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
