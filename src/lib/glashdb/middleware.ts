import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getGlashDbServerConfig } from "./env";
import { getVerifiedAuthUser } from "./auth-user";
import {
  CLIENT_DASHBOARD_SESSION_COOKIE,
  verifyClientDashboardSession,
} from "@/lib/client-dashboard-session";
import {
  isLegacyDashboardPath,
  legacyClientDashboardDestination,
  parseScopedClientDashboardPath,
} from "@/lib/client-routes";
import {
  createMarketerDashboardSession,
  MARKETER_DASHBOARD_SESSION_COOKIE,
  verifyMarketerDashboardSession,
} from "@/lib/marketer-dashboard-session";
import { dashboardSessionCookieOptions } from "@/lib/dashboard-session";

function getSafeNextPath(next?: string | null) {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function updateSession(request: NextRequest) {
  const requestedClientPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const scopedDashboardRoute = parseScopedClientDashboardPath(request.nextUrl.pathname);
  const pathname = request.nextUrl.pathname;

  const makeResponse = () => {
    const headers = new Headers(request.headers);
    headers.set("x-cds-client-path", requestedClientPath);
    return NextResponse.next({ request: { headers } });
  };
  let response = makeResponse();
  const { url, anonKey } = getGlashDbServerConfig();

  const redirectWithRefreshedCookies = (target: URL) => {
    const redirectResponse = NextResponse.redirect(target);
    const headersWithCookies = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookieHeaders = headersWithCookies.getSetCookie?.() || [];
    for (const cookieHeader of setCookieHeaders) redirectResponse.headers.append("set-cookie", cookieHeader);
    return redirectResponse;
  };

  const glashdb = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = makeResponse();
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const dashboardSession = verifyClientDashboardSession(
    request.cookies.get(CLIENT_DASHBOARD_SESSION_COOKIE)?.value,
  );
  const marketerSession = verifyMarketerDashboardSession(
    request.cookies.get(MARKETER_DASHBOARD_SESSION_COOKIE)?.value,
  );

  // The signed CDS session is the navigation authority after a login gateway
  // succeeds. Provider refreshes are deliberately not required on every page
  // transition because a transient upstream failure must not log a user out.
  const hasClientIdentity = Boolean(dashboardSession?.subject);
  const hasMarketerIdentity = Boolean(marketerSession?.subject);

  // Note: /brand-brief/[token] is a PUBLIC, no-account-needed page (clients fill
  // shared briefs without signing in), so it must NOT be guarded here.
  const isDashboardRoute =
    Boolean(scopedDashboardRoute) ||
    isLegacyDashboardPath(request.nextUrl.pathname) ||
    Boolean(legacyClientDashboardDestination(request.nextUrl.pathname)) ||
    request.nextUrl.pathname.startsWith("/agreement") ||
    request.nextUrl.pathname.startsWith("/onboarding");
  const isMarketerLogin = pathname === "/marketer/login";
  const isMarketerRoute = pathname === "/marketer" || pathname.startsWith("/marketer/");
  const isProtectedMarketerRoute = isMarketerRoute && !isMarketerLogin;

  // Only consult the upstream provider when upgrading a legacy marketer
  // session or distinguishing a marketer at a client-only route. Normal
  // navigation remains entirely first-party and user-ID bound.
  const user = (
    (isDashboardRoute && !hasClientIdentity)
    || (isProtectedMarketerRoute && !hasMarketerIdentity)
  ) ? await getVerifiedAuthUser(glashdb.auth) : null;

  if (isProtectedMarketerRoute && !hasMarketerIdentity) {
    if (user?.user_metadata?.account_type !== "brand_marketer") {
      return redirectWithRefreshedCookies(new URL("/marketer/login", request.url));
    }
    response.cookies.set(
      MARKETER_DASHBOARD_SESSION_COOKIE,
      createMarketerDashboardSession(user),
      dashboardSessionCookieOptions(),
    );
  }

  if (isMarketerLogin && hasMarketerIdentity) {
    return redirectWithRefreshedCookies(new URL("/marketer", request.url));
  }

  if (isDashboardRoute && user?.user_metadata?.account_type === "brand_marketer") {
    return redirectWithRefreshedCookies(new URL("/marketer", request.url));
  }

  if (isDashboardRoute && !hasClientIdentity) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", requestedClientPath);
    return redirectWithRefreshedCookies(loginUrl);
  }

  if (
    (request.nextUrl.pathname.startsWith("/login") ||
      request.nextUrl.pathname.startsWith("/signup")) &&
    hasClientIdentity
  ) {
    const rawNext = getSafeNextPath(request.nextUrl.searchParams.get("next"));
    const redirectResponse = redirectWithRefreshedCookies(new URL(rawNext, request.url));
    return redirectResponse;
  }

  return response;
}
