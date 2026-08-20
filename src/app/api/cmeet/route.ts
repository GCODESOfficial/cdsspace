/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import { closeStaleCmeets } from "@/lib/cmeet-autoclose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADJ = ["quick", "calm", "bright", "rapid", "deep", "bold", "clever", "warm", "kind", "gentle", "mighty", "cool"];
const NOUN = ["bird", "river", "forest", "mountain", "cloud", "star", "fox", "lion", "tiger", "bear", "wolf", "eagle"];

function genRoomCode() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  const d = Math.floor(Math.random() * 89) + 10;
  return `${a}-${n}-${d}`;
}

export async function GET(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  await closeStaleCmeets();
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("archived") === "true";
  const db = supabaseAdmin as any;

  const columns =
    "id, room_code, title, created_by, created_by_admin, started_at, ended_at, scheduled_for, audio_only, archived_at, created_at";

  // Admins see every meeting. Team members only see meetings they either
  // created or were tagged as participants on - not every historical call.
  if (actor.kind === "admin") {
    let q = db.from("team_meetings").select(columns).order("created_at", { ascending: false });
    if (!includeArchived) q = q.is("archived_at", null);
    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, meetings: data || [] });
  }

  const { data: parts } = await db
    .from("team_meeting_participants")
    .select("meeting_id")
    .eq("team_member_id", actor.id);
  const myIds = (parts || []).map((p: any) => p.meeting_id).filter(Boolean);

  const filter = myIds.length
    ? `created_by.eq.${actor.id},id.in.(${myIds.join(",")})`
    : `created_by.eq.${actor.id}`;

  let q = db.from("team_meetings").select(columns).or(filter).order("created_at", { ascending: false });
  if (!includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, meetings: data || [] });
}

/** Bulk archive / restore - body: { ids: string[], action: "archive" | "unarchive" } */
export async function PATCH(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { ids, action } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: false, error: "ids required" }, { status: 400 });
  }
  if (action !== "archive" && action !== "unarchive") {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }
  const db = supabaseAdmin as any;
  const value = action === "archive" ? new Date().toISOString() : null;
  // Team members may only touch meetings they created; admins act on any.
  let q = db.from("team_meetings").update({ archived_at: value }).in("id", ids);
  if (actor.kind !== "admin") q = q.eq("created_by", actor.id);
  const { data, error } = await q.select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: (data || []).length });
}

/** Bulk delete - body: { ids: string[] }. */
export async function DELETE(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: false, error: "ids required" }, { status: 400 });
  }
  const db = supabaseAdmin as any;
  // Team members may only delete meetings they created; admins delete any.
  let q = db.from("team_meetings").delete().in("id", ids);
  if (actor.kind !== "admin") q = q.eq("created_by", actor.id);
  const { data, error } = await q.select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: (data || []).length });
}

export async function POST(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin as any;

  let room_code = genRoomCode();
  // Guard against the very rare collision
  for (let i = 0; i < 3; i++) {
    const { data: existing } = await db.from("team_meetings").select("id").eq("room_code", room_code).maybeSingle();
    if (!existing) break;
    room_code = genRoomCode();
  }

  const { data, error } = await db
    .from("team_meetings")
    .insert({
      room_code,
      title: body.title?.trim() || "Untitled meeting",
      agenda: body.agenda || null,
      audio_only: !!body.audio_only,
      scheduled_for: body.scheduled_for || null,
      created_by: actor.kind === "team" ? actor.id : null,
      created_by_admin: actor.is_admin,
      status: body.scheduled_for ? "scheduled" : "live",
      started_at: body.scheduled_for ? null : new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Seed invited participants + DM them
  const ids: string[] = Array.isArray(body.invited_member_ids) ? body.invited_member_ids : [];
  if (ids.length) {
    const rows = ids.map((id: string) => ({ meeting_id: data.id, team_member_id: id }));
    await db.from("team_meeting_participants").insert(rows);
    const notifRows = ids.map((id: string) => ({
      recipient_id: id,
      kind: "cmeet_invite",
      title: `You're invited: ${data.title}`,
      body: body.scheduled_for ? `Scheduled for ${new Date(body.scheduled_for).toLocaleString()}` : "Live now",
      link: `/meet/${data.room_code}`,
      meeting_id: data.id,
      actor_member_id: actor.kind === "team" ? actor.id : null,
      actor_is_admin: actor.is_admin,
    }));
    await db.from("team_notifications").insert(notifRows);
  }

  return NextResponse.json({ ok: true, meeting: data });
}
