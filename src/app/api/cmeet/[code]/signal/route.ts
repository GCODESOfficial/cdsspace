import { NextRequest, NextResponse } from "next/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getToolActor } from "@/lib/team-tools-auth";
import { getClientAccountState } from "@/lib/client-account";

/**
 * CMeet signaling transport.
 *
 *   GET  -> Server-Sent Events stream, or short JSON polls, of envelopes
 *           addressed to this peer.
 *   POST -> publish one envelope to the room or to a single peer.
 *
 * The stream polls the signals table on a short interval rather than holding a
 * database LISTEN. Polling is what makes this correct on more than one server
 * instance: any instance can serve any peer, because all the state is in the
 * table. The extra latency is a fraction of a second and only applies to
 * session setup, not to media, which flows peer to peer once ICE completes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How often the stream looks for new envelopes.
const POLL_MS = 300;
// Envelopes are useless once the peers have connected; keep the table tiny.
const RETAIN_SECONDS = 120;
// A browser will drop an idle SSE connection, so send a comment line well
// inside that window.
const KEEPALIVE_MS = 15_000;

const ROOM_PATTERN = /^[a-z0-9-]{3,64}$/i;
const PEER_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const peer = req.nextUrl.searchParams.get("peer") || "";
  if (!ROOM_PATTERN.test(code)) return badRequest("Invalid room code.");
  if (!PEER_PATTERN.test(peer)) return badRequest("Invalid peer id.");

  const rawCursor = req.nextUrl.searchParams.get("cursor") || "0";

  // JSON polling is the production-safe transport. Some reverse proxies buffer
  // Server-Sent Events until the connection closes, which made cMeet look
  // offline even though the Next server and database were healthy. A short,
  // cache-free response crosses those proxies reliably and retains the exact
  // same cursor semantics as the stream.
  if (req.nextUrl.searchParams.get("transport") === "poll") {
    if (rawCursor === "latest") {
      const [latest] = await glashQuery<{ cursor: string }>(
        `select coalesce(max(id), 0)::text as cursor
           from public.cmeet_signals
          where room_code = $1`,
        [code],
      );
      return NextResponse.json(
        { ok: true, cursor: latest?.cursor || "0", messages: [] },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    if (!/^\d+$/.test(rawCursor)) return badRequest("Invalid signal cursor.");
    const rows = await glashQuery<{ id: string; payload: unknown }>(
      `select id::text, payload
         from public.cmeet_signals
        where room_code = $1
          and id > $2
          and from_peer <> $3
          and (to_peer is null or to_peer = $3)
        order by id
        limit 200`,
      [code, rawCursor, peer],
    );
    return NextResponse.json(
      {
        ok: true,
        cursor: rows.at(-1)?.id || rawCursor,
        messages: rows.map((row) => ({ id: row.id, payload: row.payload })),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  // Resume where a dropped connection left off, so a reconnect does not replay
  // the whole room or silently skip an offer.
  let cursor = Number(rawCursor);
  if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

  const encoder = new TextEncoder();
  let closed = false;
  // Held outside the stream so `cancel` can shut the timers down too. A browser
  // that navigates away cancels the stream without ever aborting the request,
  // and a poll that keeps running is a database query every 300ms, forever.
  let stop = () => { closed = true; };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(text)); } catch { closed = true; }
      };

      // Tell the client which cursor this stream started from.
      send(`event: ready\ndata: ${JSON.stringify({ cursor })}\n\n`);

      const keepalive = setInterval(() => send(": keepalive\n\n"), KEEPALIVE_MS);

      const poll = setInterval(async () => {
        if (closed) return;
        try {
          const rows = await glashQuery<{ id: string; payload: unknown }>(
            `select id, payload
               from public.cmeet_signals
              where room_code = $1
                and id > $2
                and from_peer <> $3
                and (to_peer is null or to_peer = $3)
              order by id
              limit 200`,
            [code, cursor, peer],
          );
          for (const row of rows) {
            cursor = Number(row.id);
            send(`id: ${row.id}\ndata: ${JSON.stringify(row.payload)}\n\n`);
          }
        } catch {
          // A transient database blip must not kill the stream; the next tick
          // retries from the same cursor, so nothing is lost.
        }
      }, POLL_MS);

      stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearInterval(keepalive);
        try { controller.close(); } catch { /* already closed */ }
      };

      // Already gone by the time the stream started, which happens when a peer
      // reconnects fast enough that the old request aborts during setup.
      if (req.signal.aborted) { stop(); return; }
      req.signal.addEventListener("abort", stop);
    },
    cancel() { stop(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops a reverse proxy from buffering the stream into uselessness.
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!ROOM_PATTERN.test(code)) return badRequest("Invalid room code.");

  const body = await req.json().catch(() => null) as
    | { from?: unknown; to?: unknown; payload?: unknown; messages?: unknown }
    | null;
  if (!body) return badRequest("Invalid body.");

  const from = String(body.from || "");
  if (!PEER_PATTERN.test(from)) return badRequest("Invalid sender.");
  const messages = Array.isArray(body.messages)
    ? body.messages
    : [{ to: body.to ?? null, payload: body.payload }];
  if (!messages.length || messages.length > 64) return badRequest("Invalid signal batch.");
  const normalized = messages.map((message) => {
    const entry = message && typeof message === "object" ? message as Record<string, unknown> : null;
    const to = entry?.to == null ? null : String(entry.to);
    const payload = entry?.payload;
    if ((to !== null && !PEER_PATTERN.test(to)) || !payload || typeof payload !== "object") return null;
    return { to, payload };
  });
  if (normalized.some((message) => !message)) return badRequest("Invalid signal message.");

  // Controls that affect somebody else's call must be authorized on the
  // server. Hiding these buttons from participants is useful UX, but without
  // this check a participant could forge the same signaling payload manually.
  const hostControlTypes = new Set(["host-mute", "host-mute-all", "host-set-mode", "host-end", "host-kick"]);
  const hasHostControl = normalized.some((message) => {
    const payload = message?.payload as Record<string, unknown> | undefined;
    return hostControlTypes.has(String(payload?.type || ""));
  });
  if (hasHostControl) {
    const actor = await getToolActor();
    const meeting = await glashMaybeOne<{ created_by: string | null; created_by_client: string | null }>(
      `select created_by, created_by_client from public.team_meetings where room_code = $1 limit 1`,
      [code],
    );
    const actorMemberId = actor?.kind === "team" ? actor.id : actor?.memberId || null;
    let isHost = actor?.kind === "admin" && actor.role === "super_admin";
    if (!isHost) isHost = Boolean(actorMemberId && meeting?.created_by === actorMemberId);
    if (!isHost) {
      const account = await getClientAccountState().catch(() => null);
      isHost = Boolean(account?.user?.id && meeting?.created_by_client === account.user.id);
    }
    if (!isHost) {
      return NextResponse.json({ error: "Only the meeting host can use this control." }, { status: 403 });
    }
  }

  const [row] = await glashQuery<{ id: string }>(
    `insert into public.cmeet_signals (room_code, from_peer, to_peer, payload)
     select $1, $2, message->>'to', message->'payload'
       from jsonb_array_elements($3::jsonb) with ordinality as batch(message, position)
       where exists (
         select 1
           from public.team_meetings m
          where m.room_code = $1
            and m.approval_status = 'approved'
            and m.status in ('scheduled', 'live')
       )
      order by position
     returning id`,
    [code, from, JSON.stringify(normalized)],
  );
  if (!row) {
    return NextResponse.json({ error: "This meeting is waiting for admin approval or is no longer active." }, { status: 423 });
  }

  // Joining is established by the first authenticated signaling envelope.
  // Persist it so a client's loud ringtone stops across every open dashboard
  // tab without relying on local browser state.
  const clientAccount = await getClientAccountState().catch(() => null);
  if (clientAccount?.user?.id) {
    glashQuery(
      `update public.cmeet_client_invitations invitation
          set joined_at = coalesce(invitation.joined_at, now())
         from public.team_meetings meeting
        where invitation.meeting_id = meeting.id
          and meeting.room_code = $1
          and invitation.client_user_id = $2::uuid`,
      [code, clientAccount.user.id],
    ).catch(() => undefined);
  }
  const staffActor = await getToolActor().catch(() => null);
  if (staffActor?.kind === "admin") {
    glashQuery(
      `update public.cmeet_staff_invitations invitation
          set joined_at = coalesce(invitation.joined_at, now()), joined_by = coalesce(invitation.joined_by, $2)
         from public.team_meetings meeting
        where invitation.meeting_id = meeting.id and meeting.room_code = $1`,
      [code, staffActor.email],
    ).catch(() => undefined);
  }

  // Opportunistic sweep. Doing it here keeps the table small without a cron,
  // and the predicate is indexed so it costs almost nothing.
  glashQuery(
    `delete from public.cmeet_signals where created_at < now() - ($1 || ' seconds')::interval`,
    [String(RETAIN_SECONDS)],
  ).catch(() => undefined);

  return NextResponse.json({ ok: true, id: row?.id ?? null });
}
