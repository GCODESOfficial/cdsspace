/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-api-auth";

const ADJ = ["quick", "calm", "bright", "rapid", "deep", "bold", "clever", "warm", "kind", "gentle", "mighty", "cool"];
const NOUN = ["bird", "river", "forest", "mountain", "cloud", "star", "fox", "lion", "tiger", "bear", "wolf", "eagle"];
function genRoomCode() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  const d = Math.floor(Math.random() * 89) + 10;
  return `${a}-${n}-${d}`;
}

// Create a scheduled cMeet room for a consultation and return the join link.
async function createCmeetRoom(sb: any, consultation: any, scheduledAt: string | null) {
  let roomCode = genRoomCode();
  for (let i = 0; i < 4; i += 1) {
    const { data: existing } = await sb.from("team_meetings").select("id").eq("room_code", roomCode).maybeSingle();
    if (!existing) break;
    roomCode = genRoomCode();
  }
  const { error } = await sb.from("team_meetings").insert({
    room_code: roomCode,
    title: `Consultation · ${consultation.full_name}`,
    agenda: consultation.message || null,
    scheduled_for: scheduledAt,
    created_by: null,
    created_by_admin: true,
    status: scheduledAt ? "scheduled" : "live",
    started_at: scheduledAt ? null : new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return { roomCode, link: `/meet/${roomCode}` };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "consultations.manage");
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const sb: any = getSupabaseAdmin();

  const allowed = ["status", "notes", "scheduled_at", "meeting_type", "meeting_link"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];

  // Generate a cMeet room on demand (pre-set the link ahead of the meeting).
  if (body.generate_cmeet) {
    const { data: current, error: loadErr } = await sb
      .from("consultation_requests")
      .select("full_name, message")
      .eq("id", id)
      .single();
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    const scheduledAt = (patch.scheduled_at as string | undefined) ?? body.scheduled_at ?? null;
    try {
      const { roomCode, link } = await createCmeetRoom(sb, current, scheduledAt);
      patch.meeting_type = "cmeet";
      patch.meeting_link = link;
      patch.meeting_room_code = roomCode;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create cMeet room" }, { status: 500 });
    }
  }

  // Booking a meeting moves the request to "scheduled" unless already resolved.
  if ((patch.meeting_link || patch.scheduled_at) && !("status" in patch)) {
    const { data: cur } = await sb.from("consultation_requests").select("status").eq("id", id).single();
    if (cur && !["completed", "archived"].includes(cur.status)) patch.status = "scheduled";
  }

  const { data, error } = await sb.from("consultation_requests").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ consultation: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "consultations.delete");
  if (denied) return denied;
  const { id } = await params;
  const sb: any = getSupabaseAdmin();
  const { error } = await sb.from("consultation_requests").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
