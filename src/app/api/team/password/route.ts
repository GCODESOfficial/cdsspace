/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession, hashPassword, generateSalt } from "@/lib/team-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getTeamSession();
  if (!session || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { current_password, new_password } = await req.json().catch(() => ({}));
  if (!current_password || !new_password) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }
  if (String(new_password).length < 8) {
    return NextResponse.json(
      { ok: false, error: "New password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin as any;
  const { data: member } = await db
    .from("team_members")
    .select("password_hash, password_salt")
    .eq("id", session.id)
    .single();

  if (!member) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const actual = hashPassword(current_password, member.password_salt);
  if (actual !== member.password_hash) {
    return NextResponse.json({ ok: false, error: "Current password is incorrect" }, { status: 400 });
  }

  const newSalt = generateSalt();
  const newHash = hashPassword(new_password, newSalt);

  const { error } = await db
    .from("team_members")
    .update({ password_hash: newHash, password_salt: newSalt })
    .eq("id", session.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
