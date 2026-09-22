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
 *  1. Staff walk in. The authenticated creator is the host; the super-admin
 *     account remains a host for meetings it creates.
 *  2. A signed-in client who created the room is its host and may admit people.
 *  3. The client the room was booked for walks in, proven either by the token
 *     in the link we emailed them or by a signed-in client account whose email
 *     matches. Making an invited client wait for a consultation we arranged is
 *     the wrong default, so they never reach the lobby.
 *  4. Everyone else knocks and waits for a decision.
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
    .select("id, room_code, title, status, approval_status, created_by, created_by_admin, created_by_client, guest_email, guest_token, api_key_id")
    .eq("room_code", code)
    .maybeSingle();
  return data || null;
}

/** Admins and authenticated room creators can admit others. */
async function resolveIdentity(room: any, guestToken: string | null) {
  const actor = await getToolActor();
  if (actor) {
    if (actor.kind === "admin" && actor.role === "super_admin") {
      return { role: "host" as const, name: actor.name, email: actor.email, canAdmit: true };
    }
    const actorMemberId = actor.kind === "team" ? actor.id : actor.memberId;
    const isCreator = !!actorMemberId && room.created_by === actorMemberId;
    return {
      role: isCreator ? "host" as const : "staff" as const,
      name: actor.name,
      email: actor.email,
      canAdmit: isCreator,
    };
  }

  const account = await getClientAccountState().catch(() => null);
  const accountEmail = normalizeEmail(account?.user?.email || account?.profile?.email);
  if (account?.user?.id && room.created_by_client === account.user.id) {
    return {
      role: "host" as const,
      name: account.profile?.full_name || account.profile?.company_name || "Client",
      email: accountEmail,
      canAdmit: true,
    };
  }

  // Token first: it is the only proof a client with no account can offer.
  if (guestToken && room.guest_token && guestToken === room.guest_token) {
    if (room.api_key_id) {
      return { role: "host" as const, name: "API host", email: room.guest_email || "", canAdmit: true };
    }
    return { role: "invited" as const, name: "", email: room.guest_email || "", canAdmit: false };
  }

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
  if (room.status === "ended" || room.status === "cancelled") {
    return NextResponse.json({ error: "This meeting is no longer available." }, { status: 410 });
  }

  if (room.approval_status !== "approved" || room.status === "pending_approval") {
    return NextResponse.json(
      { error: "This meeting is waiting for admin approval." },
      { status: 423 },
    );
  }

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

  if (["host", "staff", "invited"].includes(identity.role)) {
    // A future room becomes live when its verified host/co-host actually joins,
    // rather than at creation time. That makes scheduled cMeet presence and
    // automatic idle-close behavior work the same way as an instant room.
    if (room.status === "scheduled" && identity.canAdmit) {
      const now = new Date().toISOString();
      await db.from("team_meetings")
        .update({ status: "live", started_at: now, last_active_at: now })
        .eq("id", room.id)
        .eq("status", "scheduled");
    }
    return NextResponse.json({
      status: "admitted" as Verdict,
      canAdmit: identity.canAdmit,
      role: identity.role,
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
  if (room.approval_status !== "approved" || room.status === "pending_approval") {
    return NextResponse.json({ canAdmit: false, status: "waiting", approvalPending: true });
  }

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
