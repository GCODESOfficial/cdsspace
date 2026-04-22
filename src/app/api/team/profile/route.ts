/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const session = await getTeamSession();
  if (!session || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const allowed = ["full_name", "avatar_url", "role_title", "phone", "location", "bio", "language"];
  const updates: Record<string, any> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: "No changes" }, { status: 400 });
  }

  const db = supabaseAdmin as any;
  const { error } = await db.from("team_members").update(updates).eq("id", session.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
