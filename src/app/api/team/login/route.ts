/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  TEAM_SESSION_COOKIE,
  generateSessionToken,
  hashPassword,
  sessionCookieOptions,
} from "@/lib/team-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const { identifier, password } = await req.json().catch(() => ({}));
  if (!identifier?.trim() || !password?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Username/email and password are required" },
      { status: 400 }
    );
  }

  const id = String(identifier).trim().toLowerCase();
  const db = supabaseAdmin as any;

  const { data: member, error } = await db
    .from("team_members")
    .select("*")
    .or(`email.eq.${id},username.eq.${id}`)
    .maybeSingle();

  if (error || !member) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }
  if (!member.is_active) {
    return NextResponse.json({ ok: false, error: "Account is inactive" }, { status: 403 });
  }

  const expected = hashPassword(password, member.password_salt);
  if (expected !== member.password_hash) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  await db
    .from("team_members")
    .update({ session_token: token, session_expires_at: expiresAt })
    .eq("id", member.id);

  const res = NextResponse.json({
    ok: true,
    member: {
      id: member.id,
      full_name: member.full_name,
      username: member.username,
      is_sub_admin: member.is_sub_admin,
    },
  });
  res.cookies.set(TEAM_SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
