/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  if (!username || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Invalid" }, { status: 400 });
  const db = supabaseAdmin as any;
  const { data: member } = await db
    .from("team_members")
    .select("id, full_name, username, role_title, department, avatar_url, is_active")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  if (!member) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!member.is_active) return NextResponse.json({ ok: true, suspended: true, username: member.username });

  const { data: resume } = await db.from("team_resumes").select("*").eq("team_member_id", member.id).maybeSingle();
  if (!resume || !resume.is_public) return NextResponse.json({ ok: false, error: "Not published" }, { status: 404 });
  return NextResponse.json({ ok: true, member, resume });
}
