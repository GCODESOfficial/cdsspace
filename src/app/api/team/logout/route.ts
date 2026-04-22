/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { TEAM_SESSION_COOKIE } from "@/lib/team-auth";

export const runtime = "nodejs";

export async function POST() {
  const store = await cookies();
  const token = store.get(TEAM_SESSION_COOKIE)?.value;

  if (token && supabaseAdmin) {
    const db = supabaseAdmin as any;
    await db
      .from("team_members")
      .update({ session_token: null, session_expires_at: null })
      .eq("session_token", token);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TEAM_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
