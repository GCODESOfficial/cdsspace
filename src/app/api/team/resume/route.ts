/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getToolActor();
  if (!actor || actor.kind !== "team" || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin as any;
  const { data } = await db.from("team_resumes").select("*").eq("team_member_id", actor.id).maybeSingle();
  if (!data) {
    const { data: created } = await db
      .from("team_resumes")
      .insert({ team_member_id: actor.id, is_public: false })
      .select("*")
      .single();
    return NextResponse.json({ ok: true, resume: created });
  }
  return NextResponse.json({ ok: true, resume: data });
}

export async function PUT(req: Request) {
  const actor = await getToolActor();
  if (!actor || actor.kind !== "team" || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};
  const allowed = ["headline", "about", "avatar_url", "location", "website", "email_public", "socials", "skills", "past_roles", "projects", "education", "certifications", "is_public"];
  for (const k of allowed) if (k in body) patch[k] = body[k];
  const db = supabaseAdmin as any;
  const { data, error } = await db.from("team_resumes").update(patch).eq("team_member_id", actor.id).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  
  // Also sync avatar_url to the main team_members table if it changed
  if (patch.avatar_url !== undefined) {
    await db.from("team_members").update({ avatar_url: patch.avatar_url }).eq("id", actor.id);
  }

  return NextResponse.json({ ok: true, resume: data });
}
