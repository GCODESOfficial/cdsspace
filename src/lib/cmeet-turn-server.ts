import "server-only";

export type CMeetIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export class CMeetTurnError extends Error {
  readonly kind: "not_configured" | "upstream" | "invalid_response";

  constructor(kind: CMeetTurnError["kind"], message: string) {
    super(message);
    this.name = "CMeetTurnError";
    this.kind = kind;
  }
}

const CLOUDFLARE_TURN_ORIGIN = "https://rtc.live.cloudflare.com";
const DEFAULT_TTL_SECONDS = 86_400;
const MIN_TTL_SECONDS = 3_600;
const MAX_TTL_SECONDS = 86_400;
const TURN_FETCH_TIMEOUT_MS = 4_000;
const TURN_CACHE_MS = 10 * 60 * 1000;

let cachedIceServers: { value: CMeetIceServer[]; expiresAt: number } | null = null;
let pendingIceServers: Promise<CMeetIceServer[]> | null = null;

function readTtlSeconds() {
  const configured = Number.parseInt(process.env.CMEET_TURN_TTL_SECONDS || "", 10);
  if (!Number.isFinite(configured)) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, configured));
}

function isAllowedCloudflareIceUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^(?:stun:stun\.cloudflare\.com|turn:turn\.cloudflare\.com|turns:turn\.cloudflare\.com)(?::\d+)?(?:\?transport=(?:udp|tcp))?$/i.test(value);
}

function normalizeIceServer(value: unknown): CMeetIceServer | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const rawUrls = Array.isArray(candidate.urls) ? candidate.urls : [candidate.urls];
  const urls = rawUrls
    .filter(isAllowedCloudflareIceUrl)
    // Browser WebRTC stacks commonly time out on TURN port 53. Cloudflare's
    // 3478 UDP/TCP and 5349 TLS routes provide the useful relay coverage.
    .filter((url) => !/:53(?:\?|$)/.test(url));
  if (!urls.length) return null;

  const hasTurn = urls.some((url) => /^turns?:/i.test(url));
  const username = typeof candidate.username === "string" ? candidate.username : "";
  const credential = typeof candidate.credential === "string" ? candidate.credential : "";
  if (hasTurn && (!username || !credential)) return null;

  return {
    urls: urls.length === 1 ? urls[0] : urls,
    ...(username ? { username } : {}),
    ...(credential ? { credential } : {}),
  };
}

/**
 * Exchange the private Cloudflare TURN key for credentials that are safe to
 * hand to one admitted browser participant. The long-lived token never leaves
 * this server module.
 */
async function requestCMeetIceServers(): Promise<CMeetIceServer[]> {
  const keyId = (process.env.CMEET_TURN_KEY_ID || "").trim();
  const apiToken = (process.env.CMEET_TURN_API_TOKEN || "").trim();
  if (!keyId || !apiToken) {
    throw new CMeetTurnError("not_configured", "CMeet TURN relay is not configured.");
  }

  let response: Response;
  try {
    response = await fetch(
      `${CLOUDFLARE_TURN_ORIGIN}/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: readTtlSeconds() }),
        cache: "no-store",
        signal: AbortSignal.timeout(TURN_FETCH_TIMEOUT_MS),
      },
    );
  } catch {
    throw new CMeetTurnError("upstream", "The meeting relay could not be reached.");
  }

  if (!response.ok) {
    throw new CMeetTurnError("upstream", `The meeting relay rejected the request (${response.status}).`);
  }

  const payload = await response.json().catch(() => null) as { iceServers?: unknown[] } | null;
  const iceServers = Array.isArray(payload?.iceServers)
    ? payload.iceServers.map(normalizeIceServer).filter((entry): entry is CMeetIceServer => Boolean(entry))
    : [];
  const hasRelay = iceServers.some((entry) => {
    const urls = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
    return urls.some((url) => /^turns?:/i.test(url));
  });
  if (!hasRelay) {
    throw new CMeetTurnError("invalid_response", "The meeting relay returned no usable TURN server.");
  }

  return iceServers;
}

export async function generateCMeetIceServers(): Promise<CMeetIceServer[]> {
  if (cachedIceServers && cachedIceServers.expiresAt > Date.now()) {
    return cachedIceServers.value;
  }
  if (!pendingIceServers) {
    pendingIceServers = requestCMeetIceServers()
      .then((value) => {
        // Credentials themselves remain short-lived and scoped to TURN. A
        // small server cache removes an external API round-trip from every
        // participant's critical join path and coalesces simultaneous joins.
        cachedIceServers = { value, expiresAt: Date.now() + TURN_CACHE_MS };
        return value;
      })
      .finally(() => { pendingIceServers = null; });
  }
  return pendingIceServers;
}
