import { NextResponse, type NextRequest } from "next/server";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SERVER_TO_SERVER_PATHS = [
  "/api/webhooks/",
  "/api/client/payments/paystack/webhook",
  "/api/cron/",
];

type RequestBucket = {
  tokens: number;
  lastRefill: number;
  lastSeen: number;
};

declare global {
  var cdsRequestBuckets: Map<string, RequestBucket> | undefined;
}

const requestBuckets = globalThis.cdsRequestBuckets ?? new Map<string, RequestBucket>();
globalThis.cdsRequestBuckets = requestBuckets;
const MAX_REQUEST_BUCKETS = 20_000;

function requestFingerprint(value: string) {
  // A small, non-cryptographic hash is sufficient here: this map is ephemeral,
  // never logged, and only keeps raw network addresses out of memory keys.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function clientNetwork(request: NextRequest) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function pruneRequestBuckets(now: number) {
  if (requestBuckets.size < MAX_REQUEST_BUCKETS) return;
  for (const [key, bucket] of requestBuckets) {
    if (now - bucket.lastSeen > 15 * 60_000) requestBuckets.delete(key);
  }
  if (requestBuckets.size < MAX_REQUEST_BUCKETS) return;
  let removed = 0;
  for (const key of requestBuckets.keys()) {
    requestBuckets.delete(key);
    removed += 1;
    if (removed >= 1_000) break;
  }
}

function rateProfile(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const method = request.method.toUpperCase();
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
    return UNSAFE_METHODS.has(method)
      ? { name: "api-mutation", capacity: 45, refillPerSecond: 1 }
      : { name: "api-read", capacity: 120, refillPerSecond: 3 };
  }
  return { name: "page", capacity: 300, refillPerSecond: 5 };
}

function exceedsApplicationRate(request: NextRequest) {
  if (isServerToServerPath(request.nextUrl.pathname)) return false;
  const now = Date.now();
  pruneRequestBuckets(now);
  const profile = rateProfile(request);
  const key = `${profile.name}:${requestFingerprint(clientNetwork(request))}`;
  const current = requestBuckets.get(key) || {
    tokens: profile.capacity,
    lastRefill: now,
    lastSeen: now,
  };
  const elapsedSeconds = Math.max(0, (now - current.lastRefill) / 1_000);
  current.tokens = Math.min(profile.capacity, current.tokens + elapsedSeconds * profile.refillPerSecond);
  current.lastRefill = now;
  current.lastSeen = now;
  const allowed = current.tokens >= 1;
  if (allowed) current.tokens -= 1;
  requestBuckets.set(key, current);
  return !allowed;
}

function effectiveOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "") || "https";
  return `${protocol}://${host}`;
}

function requestHost(request: NextRequest) {
  return (request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host)
    .split(",")[0]
    .trim()
    .toLowerCase();
}

function productionAllowedHosts() {
  // Keep the platform hostname available for Glash's deployment health check.
  // This is the canonical hostname for the linked `cdsspace` project, not a
  // wildcard, so arbitrary Glash tenants remain blocked.
  // cdsspace.com and its www form are ours but are not canonical. They are
  // admitted only so the request reaches Next and the redirect in
  // next.config.ts can send it to cdsspace.pro. Rejecting them here produced a
  // bodyless 421 on every .com URL, which browsers render as "this page
  // couldn't load" and which no redirect could ever undo.
  const allowed = new Set([
    "cdsspace.pro",
    "www.cdsspace.pro",
    "cdsspace.com",
    "www.cdsspace.com",
    "cdsspace.glashdb.com",
  ]);
  for (const value of [process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (!value) continue;
    try {
      allowed.add(new URL(value.includes("://") ? value : `https://${value}`).host.toLowerCase());
    } catch {
      // Ignore malformed optional deployment metadata.
    }
  }
  return allowed;
}

function isInternalHost(host: string) {
  // Glash starts the container and probes it directly on the pod network
  // before any domain is attached, so the Host header is an address such as
  // "localhost:3000" or "172.30.0.3:3000". Those requests can only originate
  // inside the deployment network, and rejecting them made the runtime probe
  // read the app as unhealthy and fail the deployment.
  const hostname = host.replace(/:\d+$/u, "").replace(/^\[|\]$/gu, "");
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part))) return false;
  const [first, second] = parts.map(Number);
  if (parts.some((part) => Number(part) > 255)) return false;
  return first === 10
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function productionHostAllowed(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return true;
  const host = requestHost(request);
  return productionAllowedHosts().has(host) || isInternalHost(host);
}

function mutationOriginAllowed(request: NextRequest, origin: string) {
  const parsed = new URL(origin);
  if (process.env.NODE_ENV !== "production") {
    return parsed.origin === new URL(effectiveOrigin(request)).origin;
  }

  // Glash terminates HTTPS at its edge and may forward the application request
  // internally over HTTP. Compare the externally visible hosts instead of the
  // proxy transport scheme, while still requiring an HTTPS origin and the exact
  // host used for this request. This keeps cross-site mutations blocked without
  // rejecting legitimate form/API calls made through the edge proxy.
  const originHost = parsed.host.toLowerCase();
  return parsed.protocol === "https:"
    && productionAllowedHosts().has(originHost)
    && originHost === requestHost(request);
}

function isServerToServerPath(pathname: string) {
  return SERVER_TO_SERVER_PATHS.some((path) => pathname === path || pathname.startsWith(path));
}

export function guardIncomingRequest(request: NextRequest): NextResponse | null {
  if (!productionHostAllowed(request)) {
    return NextResponse.json({ ok: false, error: "Unrecognized request host." }, { status: 421 });
  }

  if (exceedsApplicationRate(request)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Try again shortly." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "60",
        },
      },
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  const contentType = request.headers.get("content-type") || "";
  const isMutation = UNSAFE_METHODS.has(request.method.toUpperCase());
  const isAuthSurface = ["/login", "/signup", "/forgot-password", "/reset-password"].includes(request.nextUrl.pathname);
  if (isMutation && Number.isFinite(contentLength)) {
    if (isAuthSurface && contentLength > 512 * 1024) {
      return NextResponse.json({ ok: false, error: "Request body is too large." }, { status: 413 });
    }
    if (!contentType.toLowerCase().startsWith("multipart/form-data") && contentLength > 2 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Request body is too large." }, { status: 413 });
    }
  }

  if (!isMutation || isServerToServerPath(request.nextUrl.pathname)) return null;

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    return NextResponse.json({ ok: false, error: "Cross-site mutation blocked." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (!mutationOriginAllowed(request, origin)) {
        return NextResponse.json({ ok: false, error: "Untrusted request origin." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }
  }

  return null;
}
