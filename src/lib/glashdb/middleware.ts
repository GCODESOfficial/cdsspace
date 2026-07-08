import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getGlashDbServerConfig } from "./env";

function getSafeNextPath(next?: string | null) {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getGlashDbServerConfig();

  const glashdb = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await glashdb.auth.getUser();

  // Note: /brand-brief/[token] is a PUBLIC, no-account-needed page (clients fill
  // shared briefs without signing in), so it must NOT be guarded here.
  const isDashboardRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/subscription") ||
    request.nextUrl.pathname.startsWith("/partnership") ||
    request.nextUrl.pathname.startsWith("/settings");

  if (isDashboardRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    (request.nextUrl.pathname.startsWith("/login") ||
      request.nextUrl.pathname.startsWith("/signup")) &&
    user
  ) {
    const next = getSafeNextPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(next, request.url));
  }

  return response;
}
