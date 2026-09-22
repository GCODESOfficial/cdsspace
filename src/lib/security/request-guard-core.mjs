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
