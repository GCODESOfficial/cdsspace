/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import { getClientAccountState } from "@/lib/client-account";
import { assertTrustedMutationOrigin, requestFingerprint } from "@/lib/intelligence/security";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOM_PATTERN = /^[A-Za-z0-9_-]{3,80}$/;
const PEER_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", ...headers },
  });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!assertTrustedMutationOrigin(req)) return json({ error: "Invalid request origin." }, 403);
  const { code } = await params;
  if (!ROOM_PATTERN.test(code)) return json({ error: "Invalid meeting room." }, 400);

  const body = await req.json().catch(() => null) as { peerId?: unknown; targetLanguage?: unknown; guestToken?: unknown } | null;
  const peerId = typeof body?.peerId === "string" ? body.peerId : "";
  const targetLanguage = typeof body?.targetLanguage === "string" ? body.targetLanguage : "";
  const guestToken = typeof body?.guestToken === "string" && body.guestToken.length <= 512 ? body.guestToken : "";
  if (!PEER_PATTERN.test(peerId)) return json({ error: "Invalid peer id." }, 400);
  if (!LANGUAGE_PATTERN.test(targetLanguage)) return json({ error: "Invalid translation language." }, 400);

  const apiKey = process.env.CMEET_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: "Live translation is not configured." }, 503);

  const db = getSupabaseAdmin() as any;
  if (!db) return json({ error: "Meeting service is unavailable." }, 503);
  const { data: room, error: roomError } = await db
    .from("team_meetings")
    .select("id, status, approval_status, ended_at, created_by_client, guest_email, guest_token")
    .eq("room_code", code)
    .maybeSingle();
  if (roomError) return json({ error: "Could not verify the meeting." }, 503);
  if (!room) return json({ error: "Meeting not found." }, 404);
  if (room.status === "ended" || room.ended_at) return json({ error: "This meeting has ended." }, 410);
  if (room.approval_status !== "approved" || room.status === "pending_approval") {
    return json({ error: "This meeting is waiting for admin approval." }, 423);
  }

  const actor = await getToolActor();
  let authorized = Boolean(actor);
  if (!authorized) {
    const account = await getClientAccountState().catch(() => null);
    const accountEmail = normalizeEmail(account?.user?.email || account?.profile?.email);
    authorized = Boolean(account?.user?.id && (
      room.created_by_client === account.user.id
      || (accountEmail && accountEmail === normalizeEmail(room.guest_email))
    ));
  }
  if (!authorized && guestToken && room.guest_token) {
    const supplied = Buffer.from(guestToken);
    const expected = Buffer.from(String(room.guest_token));
    authorized = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  }
  if (!authorized) {
    const { data: admission } = await db
      .from("cmeet_join_requests")
      .select("status")
      .eq("room_code", code)
      .eq("peer_id", peerId)
      .maybeSingle();
    authorized = admission?.status === "admitted";
  }
  if (!authorized) return json({ error: "You must be admitted before using live translation." }, 403);

  const limit = checkIntelligenceRateLimit(
    `cmeet-translation:${code}:${peerId}:${requestFingerprint(req)}`,
    48,
    60 * 60 * 1000,
  );
  if (!limit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
    return json({ error: "Too many translation sessions. Please retry shortly." }, 429, { "Retry-After": String(retryAfter) });
  }

  const safetyIdentifier = crypto
    .createHash("sha256")
    .update(`${code}:${peerId}`)
    .digest("hex");
  const openAIResponse = await fetch("https://api.openai.com/v1/realtime/translations/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier,
    },
    body: JSON.stringify({
      session: {
        model: "gpt-realtime-translate",
        audio: {
          input: {
            // cMeet is primarily used through laptop, tablet and phone speakers
            // rather than a close-talking headset. OpenAI defines far_field for
            // laptop/conference microphones; it removes the room noise that can
            // otherwise turn into phantom translated speech during pauses.
            noise_reduction: { type: "far_field" },
          },
          // The source language is detected by the model and cannot be
          // supplied; only the language to translate into is ours to set.
          output: { language: targetLanguage },
        },
      },
    }),
  });
  const payload = await openAIResponse.json().catch(() => null) as Record<string, unknown> | null;
  if (!openAIResponse.ok || !payload) {
    return json({ error: "Live translation is temporarily unavailable." }, 502);
  }
  return json(payload);
}
