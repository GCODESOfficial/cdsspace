import { verifyAdmin, verifyUser } from "@/lib/admin-auth";
import { getTeamSession } from "@/lib/team-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { sweepEmailQueueIfDue } from "@/lib/notification-email-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The live notification stream.
 *
 * Held connections are cheap for a browser and expensive for one Node server:
 * every open tab keeps a request alive, and an earlier version also ran a
 * database query per tab every two seconds, which competed with ordinary page
 * traffic for the connection pool. This version is deliberately frugal:
 *
 *  - the answer for one person is computed at most once every few seconds and
 *    shared by all of their tabs, so ten tabs cost one query, not ten;
 *  - the number of streams one server will hold is capped, and beyond it
 *    clients are told to poll instead;
 *  - NOTIFICATIONS_STREAM=off disables it outright, without a deploy.
 *
 * Whenever a stream is refused the client falls back to polling, so
 * notifications keep working either way.
 */
const CHECK_MS = 6_000;
const HEARTBEAT_MS = 20_000;
const LIFETIME_MS = 2 * 60_000;
const MAX_STREAMS = Number(process.env.NOTIFICATIONS_STREAM_MAX || 60);
const STAMP_CACHE_MS = 4_000;

declare global {
  var cdsOpenNotificationStreams: number | undefined;
  var cdsNotificationStampCache: Map<string, { stamp: string; at: number }> | undefined;
}

const stampCache = globalThis.cdsNotificationStampCache ?? new Map<string, { stamp: string; at: number }>();
globalThis.cdsNotificationStampCache = stampCache;

type Watcher = { actor: "team" | "client" | "admin"; id: string };

/** One shared answer per person, however many tabs they have open. */
async function latestStamp(watcher: Watcher) {
  const key = `${watcher.actor}:${watcher.id}`;
  const cached = stampCache.get(key);
  if (cached && Date.now() - cached.at < STAMP_CACHE_MS) return cached.stamp;

  const row = watcher.actor === "team"
    ? await glashMaybeOne<{ stamp: string | null }>(
      `select max(created_at)::text as stamp from public.team_notifications where recipient_id = $1::uuid`,
      [watcher.id],
    )
    : await glashMaybeOne<{ stamp: string | null }>(
      `select max(created_at)::text as stamp from public.notifications where user_id = $1::uuid`,
      [watcher.id],
    );
  const stamp = row?.stamp || "";
  stampCache.set(key, { stamp, at: Date.now() });
  // The map is keyed by person, so it stays small; this only guards against a
  // long-lived process accumulating people who signed out long ago.
  if (stampCache.size > 5_000) stampCache.clear();
  return stamp;
}

export async function GET(request: Request) {
  if ((process.env.NOTIFICATIONS_STREAM || "on").toLowerCase() === "off") {
    return new Response(null, { status: 204 });
  }
  if ((globalThis.cdsOpenNotificationStreams || 0) >= MAX_STREAMS) {
    // Refusing is safer than holding more connections than this server can
    // answer ordinary requests with. The client polls instead.
    return new Response(null, { status: 204 });
  }

  const requested = new URL(request.url).searchParams.get("actor");
  let watcher: Watcher | null = null;
  if (requested === "team") {
    const session = await getTeamSession();
    if (session) watcher = { actor: "team", id: session.id };
  } else if (requested === "client") {
    const session = await verifyUser();
    if (session) watcher = { actor: "client", id: session.user.id };
  } else if (requested === "admin") {
    const session = await verifyAdmin();
    if (session) watcher = { actor: "admin", id: String(session.id) };
  }
  if (!watcher) return new Response("Unauthorized", { status: 401 });

  // Someone is using the platform, so this is a good moment to make sure
  // queued notification email is actually going out.
  void sweepEmailQueueIfDue();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      globalThis.cdsOpenNotificationStreams = (globalThis.cdsOpenNotificationStreams || 0) + 1;
      let last = await latestStamp(watcher).catch(() => "");

      const send = (event: string, data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          closed = true;
        }
      };

      send("ready", last || "0");

      const check = setInterval(async () => {
        if (closed) return;
        try {
          const stamp = await latestStamp(watcher);
          if (stamp && stamp !== last) {
            last = stamp;
            send("pulse", stamp);
          }
        } catch {
          // A failed check is not worth dropping the connection over.
        }
      }, CHECK_MS);

      const beat = setInterval(() => send("beat", String(Date.now())), HEARTBEAT_MS);

      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(check);
        clearInterval(beat);
        globalThis.cdsOpenNotificationStreams = Math.max(0, (globalThis.cdsOpenNotificationStreams || 1) - 1);
        try {
          controller.close();
        } catch {
          // The browser may have disconnected first.
        }
      };

      const lifetime = setTimeout(stop, LIFETIME_MS);
      request.signal.addEventListener("abort", () => {
        clearTimeout(lifetime);
        stop();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
