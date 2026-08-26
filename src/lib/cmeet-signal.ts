/**
 * Client side of CMeet signaling.
 *
 * Presents the same shape the mesh code already expected from a realtime
 * channel - subscribe, send, unsubscribe - so `cmeet-rtc.ts` keeps its
 * negotiation logic unchanged and only swaps what carries the envelopes.
 *
 * Downstream is an EventSource; upstream is a plain POST. The stream resumes
 * from the last id it saw, so a dropped connection on a mobile hand-off cannot
 * lose an offer or an ICE candidate.
 */

export type SignalEnvelope = Record<string, unknown> & { type: string };

export interface SignalTransport {
  send: (payload: SignalEnvelope, to?: string | null) => void;
  close: () => void;
}

// Backoff for a stream that keeps dropping, so a dead room does not hammer.
const RETRY_MS = [500, 1000, 2000, 4000, 8000];

export function openSignalTransport({
  roomCode,
  peerId,
  onMessage,
  onOpen,
  onError,
}: {
  roomCode: string;
  peerId: string;
  onMessage: (payload: SignalEnvelope) => void;
  onOpen?: () => void;
  onError?: (message: string) => void;
}): SignalTransport {
  const base = `/api/cmeet/${encodeURIComponent(roomCode)}/signal`;
  let source: EventSource | null = null;
  let cursor = 0;
  let attempt = 0;
  let stopped = false;
  let retryTimer = 0;

  const connect = () => {
    if (stopped) return;
    source = new EventSource(`${base}?peer=${encodeURIComponent(peerId)}&cursor=${cursor}`);

    source.addEventListener("ready", () => {
      attempt = 0;
      onOpen?.();
    });

    source.onmessage = (event) => {
      // The id is the table cursor; keeping it is what makes a resume exact.
      if (event.lastEventId) {
        const next = Number(event.lastEventId);
        if (Number.isFinite(next) && next > cursor) cursor = next;
      }
      try {
        onMessage(JSON.parse(event.data) as SignalEnvelope);
      } catch {
        // A malformed envelope is not worth tearing the stream down for.
      }
    };

    source.onerror = () => {
      if (stopped) return;
      try { source?.close(); } catch { /* already closed */ }
      source = null;
      const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
      attempt += 1;
      if (attempt === RETRY_MS.length) {
        onError?.("Lost the connection to the meeting. Still retrying.");
      }
      retryTimer = window.setTimeout(connect, delay);
    };
  };

  connect();

  return {
    send: (payload, to = null) => {
      // Fire and forget: a lost candidate is recovered by ICE restart, and
      // blocking negotiation on an ack would be worse than the occasional drop.
      fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: peerId, to, payload }),
        keepalive: true,
      }).catch(() => undefined);
    },
    close: () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      try { source?.close(); } catch { /* already closed */ }
      source = null;
    },
  };
}
