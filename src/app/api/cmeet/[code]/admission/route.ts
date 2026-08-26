/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import { getClientAccountState } from "@/lib/client-account";

/**
 * CMeet lobby.
 *
 * Three ways into a room, in order of precedence:
 *
 *  1. Staff (super admin, sub admin, or a team member) walk in and are the only
 *     ones who can admit anybody else.
 *  2. The client the room was booked for walks in, proven either by the token
 *     in the link we emailed them or by a signed-in client account whose email
 *     matches. Making an invited client wait for a consultation we arranged is
 *     the wrong default, so they never reach the lobby.
 *  3. Everyone else knocks and waits for a decision.
 *
 * Admission is decided server side on every request. A client that lies about
 * being admitted still has to get past this endpoint before signaling matters.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PEER_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

type Verdict = "admitted" | "waiting" | "denied";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function loadRoom(db: any, code: string) {
  const { data } = await db
    .from("team_meetings")
    .select("id, room_code, title, status, guest_email, guest_token")
    .eq("room_code", code)
    .maybeSingle();
  return data || null;
}

/** Staff can admit others; the invited client can only admit themselves. */
async function resolveIdentity(room: any, guestToken: string | null) {
  const actor = await getToolActor();
  if (actor) {
    return { role: "staff" as const, name: actor.name, email: actor.email, canAdmit: true };
  }

  // Token first: it is the only proof a client with no account can offer.
  if (guestToken && room.guest_token && guestToken === room.guest_token) {
    return { role: "invited" as const, name: "", email: room.guest_email || "", canAdmit: false };
  }

  const account = await getClientAccountState().catch(() => null);
  const accountEmail = normalizeEmail(account?.user?.email || account?.profile?.email);
  if (accountEmail && room.guest_email && accountEmail === normalizeEmail(room.guest_email)) {
    return { role: "invited" as const, name: account?.profile?.full_name || "", email: accountEmail, canAdmit: false };
  }

  return { role: "guest" as const, name: "", email: accountEmail, canAdmit: false };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = getSupabaseAdmin() as any;
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null) as
    | { action?: string; peerId?: string; name?: string; guestToken?: string; requestId?: string; decision?: string }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const room = await loadRoom(db, code);
  if (!room) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

  const identity = await resolveIdentity(room, body.guestToken || null);

  /* ---- Staff deciding on someone waiting ---- */
  if (body.action === "decide") {
    if (!identity.canAdmit) return NextResponse.json({ error: "Only the host can admit people." }, { status: 403 });
    const decision = body.decision === "admit" ? "admitted" : "denied";
    if (!body.requestId) return NextResponse.json({ error: "Missing request." }, { status: 400 });
    await db
      .from("cmeet_join_requests")
      .update({ status: decision, decided_at: new Date().toISOString(), decided_by: identity.name })
      .eq("id", body.requestId)
      .eq("room_code", code);
    return NextResponse.json({ ok: true, status: decision });
  }

  /* ---- Someone asking to come in ---- */
  const peerId = String(body.peerId || "");
  if (!PEER_PATTERN.test(peerId)) return NextResponse.json({ error: "Invalid peer id." }, { status: 400 });
  const name = String(body.name || "").trim().slice(0, 80) || "Guest";

  if (identity.role === "staff" || identity.role === "invited") {
    return NextResponse.json({
      status: "admitted" as Verdict,
      canAdmit: identity.canAdmit,
      reason: identity.role,
    });
  }

  // A refresh re-uses the existing row so a host does not see duplicates, and
  // a decision already made is honoured rather than reset to waiting.
  const { data: existing } = await db
    .from("cmeet_join_requests")
    .select("id, status")
    .eq("room_code", code)
    .eq("peer_id", peerId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ status: existing.status as Verdict, requestId: existing.id, canAdmit: false });
  }

  const { data: created, error } = await db
    .from("cmeet_join_requests")
    .insert({ room_code: code, peer_id: peerId, name, email: identity.email || null })
    .select("id, status")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: created.status as Verdict, requestId: created.id, canAdmit: false });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = getSupabaseAdmin() as any;
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const room = await loadRoom(db, code);
  if (!room) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

  const guestToken = req.nextUrl.searchParams.get("g");
  const identity = await resolveIdentity(room, guestToken);

  // Host polling the lobby.
  if (identity.canAdmit) {
    const { data } = await db
      .from("cmeet_join_requests")
      .select("id, peer_id, name, email, requested_at")
      .eq("room_code", code)
      .eq("status", "waiting")
      .order("requested_at", { ascending: true });
    return NextResponse.json({ canAdmit: true, waiting: data ?? [] });
  }

  // Someone in the lobby polling their own verdict.
  const peerId = req.nextUrl.searchParams.get("peer") || "";
  if (!PEER_PATTERN.test(peerId)) return NextResponse.json({ canAdmit: false, status: "waiting" });

  const { data } = await db
    .from("cmeet_join_requests")
    .select("status")
    .eq("room_code", code)
    .eq("peer_id", peerId)
    .maybeSingle();

  return NextResponse.json({ canAdmit: false, status: (data?.status as Verdict) || "waiting" });
}
