import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/glashdb/server";

/**
 * Start "Continue with LinkedIn" using GlashDB's native OAuth (the same path as
 * Google). GlashDB's `linkedin_oidc` provider must be enabled in the GlashDB
 * project Auth settings with the LinkedIn Client ID/Secret and the GlashDB auth
 * callback registered on the LinkedIn app - the app-level LINKEDIN_* env vars
 * power content publishing, NOT this login flow.
 *
 * Mirrors /api/auth/google/login: server-side signInWithOAuth sets the PKCE
 * cookie on this origin, then we redirect to LinkedIn; GlashDB returns to
 * `<origin>/auth/callback` which completes the session. redirect_to must stay
 * a bare `<origin>/auth/callback` to match GlashDB's exact redirect allow-list.
 */
function getOrigin(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SITE_URL) {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
  }
  const host = (req.headers.get("x-forwarded-host") || req.nextUrl.host).split(",")[0].trim();
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${isLocal ? "http" : "https"}://${host}`;
}

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const origin = getOrigin(req);
  const redirectTo = `${origin}/auth/callback`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const glash = (await createClient()) as any;
  const { data, error } = await glash.auth.signInWithOAuth({
    provider: "linkedin_oidc",
    options: { skipBrowserRedirect: true, redirectTo },
  });

  if (error || !data?.url) {
    const url = new URL("/login", origin);
    url.searchParams.set(
      "error",
      /disabled|not enabled|unsupported/i.test(error?.message || "") ? "linkedin_disabled" : "linkedin_start_failed",
    );
    return NextResponse.redirect(url);
  }

  const store = await cookies();
  store.set("cds_oauth_next", next, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(data.url);
}
