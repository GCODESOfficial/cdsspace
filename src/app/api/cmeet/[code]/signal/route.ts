import { NextRequest, NextResponse } from "next/server";
import { glashQuery } from "@/lib/glashdb/postgres";

/**
 * CMeet signaling transport.
 *
 *   GET  -> Server-Sent Events stream of envelopes addressed to this peer.
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

  // Resume where a dropped connection left off, so a reconnect does not replay
  // the whole room or silently skip an offer.
  let cursor = Number(req.nextUrl.searchParams.get("cursor") || 0);
  if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

  const encoder = new TextEncoder();
  let closed = false;

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

      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearInterval(keepalive);
        try { controller.close(); } catch { /* already closed */ }
      };

      req.signal.addEventListener("abort", stop);
    },
    cancel() { closed = true; },
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
    | { from?: unknown; to?: unknown; payload?: unknown }
    | null;
  if (!body) return badRequest("Invalid body.");

  const from = String(body.from || "");
  const to = body.to == null ? null : String(body.to);
  if (!PEER_PATTERN.test(from)) return badRequest("Invalid sender.");
  if (to !== null && !PEER_PATTERN.test(to)) return badRequest("Invalid recipient.");
  if (!body.payload || typeof body.payload !== "object") return badRequest("Missing payload.");

  const [row] = await glashQuery<{ id: string }>(
    `insert into public.cmeet_signals (room_code, from_peer, to_peer, payload)
     values ($1, $2, $3, $4) returning id`,
    [code, from, to, JSON.stringify(body.payload)],
  );

  // Opportunistic sweep. Doing it here keeps the table small without a cron,
  // and the predicate is indexed so it costs almost nothing.
  glashQuery(
    `delete from public.cmeet_signals where created_at < now() - ($1 || ' seconds')::interval`,
    [String(RETAIN_SECONDS)],
  ).catch(() => undefined);

  return NextResponse.json({ ok: true, id: row?.id ?? null });
}
