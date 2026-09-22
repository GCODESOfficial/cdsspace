/**
 * Client side of CMeet signaling.
 *
 * Presents the same shape the mesh code already expected from a realtime
 * channel - subscribe, send, unsubscribe - so `cmeet-rtc.ts` keeps its
 * negotiation logic unchanged and only swaps what carries the envelopes.
 *
 * Downstream uses short cursor-based JSON polls; upstream is an ordered,
 * retryable batch POST. Offers must reach the database before their ICE
 * candidates: sending every signal as an independent fire-and-forget request
 * allowed a later candidate to overtake a failed offer, leaving remote tiles
 * permanently black in rooms with three or more participants.
 * Short responses work through hosts and mobile proxies that buffer long-lived
 * EventSource responses. The cursor resumes exactly after a network hand-off,
 * so an offer or ICE candidate is not skipped.
 */

export type SignalEnvelope = Record<string, unknown> & { type: string };

export interface SignalTransport {
  send: (payload: SignalEnvelope, to?: string | null) => void;
  flush: () => Promise<void>;
  close: () => void;
}

// Backoff for a connection that keeps dropping, so a dead room does not hammer.
const RETRY_MS = [500, 1000, 2000, 4000, 8000];
const POLL_MS = 350;
const SIGNAL_BATCH_MS = 18;
const MAX_SIGNAL_BATCH = 64;

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
  let cursor = "latest";
  let attempt = 0;
  let stopped = false;
  let opened = false;
  let pollTimer = 0;
  let pollAbort: AbortController | null = null;
  let flushTimer = 0;
  let draining = false;
  const outgoing: { payload: SignalEnvelope; to: string | null }[] = [];

  const poll = async () => {
    if (stopped) return;
    pollAbort = new AbortController();
    try {
      const query = new URLSearchParams({
        peer: peerId,
        cursor,
        transport: "poll",
      });
      const response = await fetch(`${base}?${query}`, {
        cache: "no-store",
        credentials: "include",
        signal: pollAbort.signal,
      });
      const result = await response.json().catch(() => ({})) as {
        cursor?: string;
        messages?: { id?: string; payload?: SignalEnvelope }[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Meeting signaling is temporarily unavailable.");

      cursor = String(result.cursor || (cursor === "latest" ? "0" : cursor));
      attempt = 0;
      if (!opened) {
        opened = true;
        onOpen?.();
      }
      for (const message of result.messages || []) {
        if (message.id) cursor = message.id;
        if (message.payload?.type) onMessage(message.payload);
      }
      if (!stopped) pollTimer = window.setTimeout(poll, POLL_MS);
    } catch (error) {
      if (stopped || (error instanceof DOMException && error.name === "AbortError")) return;
      const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]!;
      attempt += 1;
      if (attempt === RETRY_MS.length) {
        onError?.("The meeting connection is unstable. Reconnecting…");
      }
      pollTimer = window.setTimeout(poll, delay);
    } finally {
      pollAbort = null;
    }
  };

  void poll();

  const wait = (milliseconds: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

  const deliver = async (batch: { payload: SignalEnvelope; to: string | null }[]) => {
    for (let retry = 0; retry <= RETRY_MS.length; retry += 1) {
      try {
        const response = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: peerId, messages: batch }),
          keepalive: true,
          credentials: "include",
        });
        if (!response.ok) throw new Error(`Signal delivery failed (${response.status}).`);
        return true;
      } catch {
        if (stopped || retry === RETRY_MS.length) break;
        await wait(RETRY_MS[retry]!);
      }
    }
    onError?.("The meeting connection is unstable. Reconnecting…");
    return false;
  };

  const drain = async () => {
    if (draining || !outgoing.length) return;
    draining = true;
    window.clearTimeout(flushTimer);
    try {
      while (outgoing.length) {
        const batch = outgoing.slice(0, MAX_SIGNAL_BATCH);
        // Do not let a later ICE batch overtake an offer batch. Only remove
        // these messages after the server confirms the ordered insert.
        const delivered = await deliver(batch);
        outgoing.splice(0, batch.length);
        if (!delivered && stopped) break;
      }
    } finally {
      draining = false;
      if (!stopped && outgoing.length) flushTimer = window.setTimeout(() => { void drain(); }, SIGNAL_BATCH_MS);
    }
  };

  const scheduleDrain = () => {
    if (draining || flushTimer) return;
    flushTimer = window.setTimeout(() => {
      flushTimer = 0;
      void drain();
    }, SIGNAL_BATCH_MS);
  };

  return {
    send: (payload, to = null) => {
      outgoing.push({ payload, to });
      // Start a leave write before CMeetClient closes the transport in the
      // same tick. Other signals get a tiny batching window for one DB write.
      if (["leave", "host-end", "host-kick", "host-mute-all"].includes(payload.type)) void drain();
      else scheduleDrain();
    },
    flush: drain,
    close: () => {
      stopped = true;
      window.clearTimeout(pollTimer);
      window.clearTimeout(flushTimer);
      pollAbort?.abort();
      pollAbort = null;
    },
  };
}
