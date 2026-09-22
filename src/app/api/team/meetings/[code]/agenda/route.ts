/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import { getClientAccountState } from "@/lib/client-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function resolveMeeting(code: string) {
  if (!supabaseAdmin) return null;
  const db = supabaseAdmin as any;
  const { data } = await db
    .from("team_meetings")
    .select("id, room_code, created_by, created_by_client, guest_email, guest_token")
    .eq("room_code", code)
    .maybeSingle();
  return data || null;
}

async function canParticipate(meeting: any, body: Record<string, unknown>) {
  if (await getToolActor()) return true;
  const account = await getClientAccountState().catch(() => null);
  const accountEmail = normalizeEmail(account?.user?.email || account?.profile?.email);
  if (account?.user?.id && account.user.id === meeting.created_by_client) return true;
  if (accountEmail && accountEmail === normalizeEmail(meeting.guest_email)) return true;

  const token = typeof body.guestToken === "string" ? body.guestToken : "";
  if (token && meeting.guest_token && safeEqual(token, String(meeting.guest_token))) return true;

  const peerId = typeof body.peerId === "string" ? body.peerId : "";
  if (!peerId) return false;
  const db = supabaseAdmin as any;
  const { data } = await db.from("cmeet_join_requests")
    .select("status")
    .eq("room_code", meeting.room_code)
    .eq("peer_id", peerId)
    .maybeSingle();
  return data?.status === "admitted";
}

async function isMeetingHost(meeting: any) {
  const actor = await getToolActor();
  if (actor?.kind === "admin" && actor.role === "super_admin") return true;
  const actorMemberId = actor?.kind === "team" ? actor.id : actor?.memberId || null;
  if (actorMemberId && actorMemberId === meeting.created_by) return true;
  const account = await getClientAccountState().catch(() => null);
  return Boolean(account?.user?.id && account.user.id === meeting.created_by_client);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const { code } = await params;
  const meeting = await resolveMeeting(code);
  if (!meeting) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!(await canParticipate(meeting, {
    peerId: req.nextUrl.searchParams.get("peer") || "",
    guestToken: req.nextUrl.searchParams.get("g") || "",
  }))) {
    return NextResponse.json({ ok: false, error: "Join the meeting before viewing its agenda." }, { status: 403 });
  }
  const db = supabaseAdmin as any;
  const { data, error } = await db.from("team_meeting_agenda_items")
    .select("id, position, title, completed_at")
    .eq("meeting_id", meeting.id)
    .order("position", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const { code } = await params;
  const meeting = await resolveMeeting(code);
  if (!meeting) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!(await isMeetingHost(meeting))) {
    return NextResponse.json({ ok: false, error: "Only the meeting host can add agenda items." }, { status: 403 });
  }
  const { title, duration_minutes, presenter_id } = await req.json().catch(() => ({}));
  if (!title?.trim()) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });

  const db = supabaseAdmin as any;
  const { data: max } = await db.from("team_meeting_agenda_items")
    .select("position").eq("meeting_id", meeting.id).order("position", { ascending: false }).limit(1);
  const nextPosition = ((max?.[0]?.position as number) ?? -1) + 1;
  const { data, error } = await db.from("team_meeting_agenda_items").insert({
    meeting_id: meeting.id,
    title: String(title).trim().slice(0, 180),
    duration_minutes: duration_minutes || null,
    presenter_id: presenter_id || null,
    position: nextPosition,
  }).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const { code } = await params;
  const meeting = await resolveMeeting(code);
  if (!meeting) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (!(await canParticipate(meeting, body))) {
    return NextResponse.json({ ok: false, error: "Join the meeting before updating its agenda." }, { status: 403 });
  }
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  const db = supabaseAdmin as any;
  const { error } = await db.from("team_meeting_agenda_items")
    .update({ completed_at: body.completed ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("meeting_id", meeting.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const { code } = await params;
  const meeting = await resolveMeeting(code);
  if (!meeting) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!(await isMeetingHost(meeting))) {
    return NextResponse.json({ ok: false, error: "Only the meeting host can remove agenda items." }, { status: 403 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  const db = supabaseAdmin as any;
  const { error } = await db.from("team_meeting_agenda_items").delete().eq("id", id).eq("meeting_id", meeting.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
