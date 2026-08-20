import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/glashdb/server";

/**
 * Start "Continue with Google" using GlashDB's native OAuth.
 *
 * We call signInWithOAuth server-side (which sets the PKCE code-verifier cookie
 * on THIS origin) and redirect the browser to GlashDB's Google authorize URL.
 * Google returns to GlashDB, which redirects back to `<origin>/auth/callback`,
 * where `exchangeCodeForSession` completes the login. Everything runs against
 * api.glashdb.com - no Supabase, no Vercel.
 *
 * CRITICAL: GlashDB matches `redirect_to` against the project's allowed Redirect
 * URLs by EXACT string, INCLUDING scheme and query string. So:
 *   - we send a bare `<origin>/auth/callback` (no ?next=…) - a query string would
 *     break the match and yield "redirectTo is not allowed for this project";
 *   - we force https for real domains (http only for localhost), because the
 *     allow-list entry is https and http≠https;
 *   - the post-login destination ("next") is carried in a short-lived cookie
 *     instead of the URL, and read back in /auth/callback.
 * Each origin used (https://cdsspace.pro, http://localhost:3000, …) must be in
 * the GlashDB Redirect URLs list.
 */
function getOrigin(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SITE_URL) {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
  }
  const host = (req.headers.get("x-forwarded-host") || req.nextUrl.host).split(",")[0].trim();
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = isLocal ? "http" : "https";
  return `${proto}://${host}`;
}

function safeNext(raw: string | null): string {
  // Only allow same-site absolute paths, never open redirects.
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const origin = getOrigin(req);
  const redirectTo = `${origin}/auth/callback`; // MUST stay bare (no query) to match the allow-list

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const glash = (await createClient()) as any;
  const { data, error } = await glash.auth.signInWithOAuth({
    provider: "google",
    options: { skipBrowserRedirect: true, redirectTo },
  });

  if (error || !data?.url) {
    const url = new URL("/login", origin);
    url.searchParams.set(
      "error",
      /disabled/i.test(error?.message || "") ? "google_disabled" : "google_start_failed",
    );
    return NextResponse.redirect(url);
  }

  // Carry the post-login destination in a short-lived cookie (the URL can't hold
  // it without breaking GlashDB's exact-match redirect allow-list).
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
