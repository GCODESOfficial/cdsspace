const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_USER_ID_PATTERN = /^[a-z0-9]{8}$/i;

const LEGACY_CLIENT_ROUTES: Record<string, string> = {
  "/brand-brief": "/dashboard/brand-brief",
  "/settings": "/dashboard/settings",
  "/subscription": "/dashboard/subscription",
};

export interface ScopedClientDashboardRoute {
  userId: string;
  dashboardPath: string;
}

function splitPathSuffix(value: string) {
  const marker = value.search(/[?#]/);
  if (marker < 0) return { pathname: value, suffix: "" };
  return { pathname: value.slice(0, marker), suffix: value.slice(marker) };
}

export function isClientUserId(value: string | null | undefined): value is string {
  return typeof value === "string" && (UUID_PATTERN.test(value) || PUBLIC_USER_ID_PATTERN.test(value));
}

export function isLegacyClientUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeClientUserId(value: string) {
  return UUID_PATTERN.test(value) ? value.toLowerCase() : value.toUpperCase();
}

export function parseScopedClientDashboardPath(pathname: string): ScopedClientDashboardRoute | null {
  const match = pathname.match(/^\/([^/]+)(\/dashboard(?:\/.*)?$)/i);
  if (!match || !isClientUserId(match[1])) return null;
  return { userId: normalizeClientUserId(match[1]), dashboardPath: match[2] || "/dashboard" };
}

export function clientDashboardPath(userId: string, destination = "/dashboard") {
  if (!isClientUserId(userId)) return destination;

  const { pathname, suffix } = splitPathSuffix(destination);
  const alreadyScoped = parseScopedClientDashboardPath(pathname);
  if (alreadyScoped) {
    return `/${normalizeClientUserId(userId)}${alreadyScoped.dashboardPath}${suffix}`;
  }

  const dashboardPath = LEGACY_CLIENT_ROUTES[pathname] || pathname;
  if (dashboardPath !== "/dashboard" && !dashboardPath.startsWith("/dashboard/")) {
    return destination;
  }

  return `/${normalizeClientUserId(userId)}${dashboardPath}${suffix}`;
}

export function isLegacyDashboardPath(pathname: string) {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export function legacyClientDashboardDestination(pathname: string) {
  return LEGACY_CLIENT_ROUTES[pathname] || null;
}
