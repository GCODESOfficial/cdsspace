/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const url = new URL(req.url);
  const username = url.searchParams.get("username");
  const member_id = url.searchParams.get("member_id");
  const db = supabaseAdmin as any;

  let target_id = member_id;
  if (!target_id && username) {
    const { data } = await db
      .from("team_members")
      .select("id")
      .eq("username", username.toLowerCase())
      .maybeSingle();
    target_id = data?.id;
  }
  if (!target_id) return NextResponse.json({ ok: false, error: "Missing target" }, { status: 400 });

  const { data: endorsements } = await db
    .from("team_resume_endorsements")
    .select("id, skill, note, endorser_member_id, endorser_is_admin, created_at")
    .eq("team_member_id", target_id)
    .order("created_at", { ascending: false });

  // Hydrate endorser info
  const ids = Array.from(
    new Set((endorsements || []).map((e: any) => e.endorser_member_id).filter(Boolean))
  );
  const members: Record<string, any> = {};
  if (ids.length > 0) {
    const { data: ms } = await db
      .from("team_members")
      .select("id, full_name, username, avatar_url, role_title")
      .in("id", ids);
    (ms || []).forEach((m: any) => {
      members[m.id] = m;
    });
  }

  const hydrated = (endorsements || []).map((e: any) => ({
    ...e,
    endorser: e.endorser_member_id ? members[e.endorser_member_id] : null,
  }));

  return NextResponse.json({ ok: true, endorsements: hydrated });
}

export async function POST(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { team_member_id, username, skill, note } = await req.json().catch(() => ({}));
  if (!skill?.trim()) return NextResponse.json({ ok: false, error: "Skill required" }, { status: 400 });

  const db = supabaseAdmin as any;
  let target_id = team_member_id;
  if (!target_id && username) {
    const { data } = await db
      .from("team_members")
      .select("id")
      .eq("username", String(username).toLowerCase())
      .maybeSingle();
    target_id = data?.id;
  }
  if (!target_id) return NextResponse.json({ ok: false, error: "Target not found" }, { status: 404 });

  // Can't endorse yourself
  if (team && team.id === target_id) {
    return NextResponse.json({ ok: false, error: "You can't endorse yourself" }, { status: 400 });
  }

  const { error } = await db.from("team_resume_endorsements").insert({
    team_member_id: target_id,
    endorser_member_id: team?.id || null,
    endorser_is_admin: !!admin,
    skill: skill.trim(),
    note: note?.trim() || null,
  });

  if (error) {
    if (String(error.message).toLowerCase().includes("duplicate")) {
      return NextResponse.json(
        { ok: false, error: "You've already endorsed this person for that skill." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Notify the recipient
  if (target_id) {
    await db.from("team_notifications").insert({
      recipient_id: target_id,
      kind: "endorsement",
      title: `You were endorsed for ${skill.trim()}`,
      body: note?.trim() || null,
      link: `/team/cresume`,
      actor_member_id: team?.id || null,
      actor_is_admin: !!admin,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const db = supabaseAdmin as any;
  // Only an admin or the original endorser may delete
  let query = db.from("team_resume_endorsements").delete().eq("id", id);
  if (!admin && team) query = query.eq("endorser_member_id", team.id);

  const { error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
