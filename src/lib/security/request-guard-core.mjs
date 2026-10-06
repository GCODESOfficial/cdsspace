/**
 * Resolve the public client address added by the trusted reverse proxy.
 *
 * Caddy's x-real-ip can identify the immediate proxy hop, while the first
 * x-forwarded-for entry identifies the original client. Prefer the latter so
 * unrelated visitors do not consume one shared rate-limit bucket.
 *
 * @param {Headers} headers
 */
export function clientNetworkFromHeaders(headers) {
  return headers.get("cf-connecting-ip")?.trim()
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")?.trim()
    || "unknown";
}

/**
 * Select an application-level limiter for requests that can mutate state or
 * exercise API handlers. Safe page navigation is deliberately omitted: a
 * Next.js dashboard can issue many RSC and prefetch requests for one user
 * action, and returning an API-shaped 429 response for an HTML route makes the
 * whole site unusable. Public document traffic belongs at the edge limiter.
 *
 * @param {string} pathname
 * @param {string} requestMethod
 */
export function applicationRateProfile(pathname, requestMethod) {
  const method = requestMethod.toUpperCase();
  const unsafe = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

  if (pathname === "/api/security/bot-challenge") {
    return { name: "bot-challenge", capacity: 20, refillPerSecond: 1 / 15 };
  }
  if (
    pathname.startsWith("/api/auth/")
    || pathname === "/api/admin-login"
    || pathname === "/api/team/login"
  ) {
    return { name: "authentication", capacity: 30, refillPerSecond: 0.5 };
  }
  if (pathname.startsWith("/api/")) {
    return unsafe
      ? { name: "api-mutation", capacity: 45, refillPerSecond: 1 }
      : { name: "api-read", capacity: 120, refillPerSecond: 3 };
  }
  if (unsafe) {
    return { name: "page-mutation", capacity: 60, refillPerSecond: 1 };
  }
  return null;
}

/**
 * Cookies that identify one signed-in person on one device. Only their presence
 * is read here; each route still verifies the session itself.
 */
export const RATE_LIMIT_SESSION_COOKIES = [
  "admin_session",
  "team_session",
  "cds_client_dashboard",
  "cds_marketer_dashboard",
];

// A whole office shares one public address, so signed-in API traffic from one
// network may reach several people's worth before the network ceiling applies.
const SIGNED_IN_NETWORK_MULTIPLIER = 8;

/**
 * The token buckets a request must fit inside.
 *
 * Signed-in API traffic is limited per session, not per network. Staff on the
 * same office connection share one public IP, and a per-IP bucket let their
 * combined dashboard polling lock every one of them out of the admin portal
 * with a 429. A per-network ceiling remains, sized for a full office, so a
 * client inventing session cookies cannot escape the limiter.
 *
 * @param {{ name: string; capacity: number; refillPerSecond: number }} profile
 * @param {string} network
 * @param {string | null | undefined} sessionToken
 */
export function rateLimitBuckets(profile, network, sessionToken) {
  const perSession = profile.name === "api-read" || profile.name === "api-mutation";
  if (!sessionToken || !perSession) {
    return [{ key: `${profile.name}:network:${network}`, capacity: profile.capacity, refillPerSecond: profile.refillPerSecond }];
  }
  return [
    { key: `${profile.name}:session:${sessionToken}`, capacity: profile.capacity, refillPerSecond: profile.refillPerSecond },
    {
      key: `${profile.name}:signed-in-network:${network}`,
      capacity: profile.capacity * SIGNED_IN_NETWORK_MULTIPLIER,
      refillPerSecond: profile.refillPerSecond * SIGNED_IN_NETWORK_MULTIPLIER,
    },
  ];
}

// Raw file chunks for client deliveries (the web uploads large files in
// pieces; the route checks each piece's exact size and the admin's clearance).
// Kept equal to MAX_DELIVERY_UPLOAD_CHUNK_BYTES in src/lib/client-deliveries.ts.
export const DELIVERY_CHUNK_PATH = "/api/admin/clients/deliveries/upload";
export const DELIVERY_CHUNK_MAX_BYTES = 48 * 1024 * 1024;

/**
 * Largest body a write may carry, or null for no limit here (multipart
 * uploads are limited by each route). JSON and form posts stay at 2MB; the
 * delivery chunk route alone accepts raw binary pieces up to 48MB.
 *
 * @param {string} pathname
 * @param {string} contentType
 * @param {boolean} isAuthSurface
 */
export function mutationBodyLimit(pathname, contentType, isAuthSurface) {
  if (isAuthSurface) return 512 * 1024;
  const type = contentType.toLowerCase();
  if (type.startsWith("multipart/form-data")) return null;
  if (pathname === DELIVERY_CHUNK_PATH && type.startsWith("application/octet-stream")) return DELIVERY_CHUNK_MAX_BYTES;
  return 2 * 1024 * 1024;
}
