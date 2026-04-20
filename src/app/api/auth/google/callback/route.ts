import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Step 2 of CDS-Space-hosted Google OAuth.
 *
 * 1. Verify CSRF state matches the cookie set in /login
 * 2. Exchange the auth code for an id_token via Google's token endpoint
 * 3. Hand the id_token to Supabase via signInWithIdToken — Supabase verifies
 *    the JWT signature, creates/updates the user, and (because we use a
 *    cookie-aware server client) sets the sb-* session cookies on our domain
 * 4. Ensure a `profiles` row exists for new users
 * 5. Redirect the user to wherever they were headed
 */
function getOrigin(req: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
}

function fail(req: NextRequest, reason: string) {
  const origin = getOrigin(req);
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const stateFromGoogle = url.searchParams.get("state");
  const errorFromGoogle = url.searchParams.get("error");

  if (errorFromGoogle) return fail(req, `google_${errorFromGoogle}`);
  if (!code || !stateFromGoogle) return fail(req, "missing_code");

  // Verify CSRF state
  const stateCookie = req.cookies.get("cds_oauth_state")?.value;
  const nonceCookie = req.cookies.get("cds_oauth_nonce")?.value;
  const nextCookie = req.cookies.get("cds_oauth_next")?.value || "/dashboard";
  if (!stateCookie || stateCookie !== stateFromGoogle) return fail(req, "state_mismatch");
  if (!nonceCookie) return fail(req, "missing_nonce");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail(req, "google_creds_missing");

  const origin = getOrigin(req);
  const redirectUri = `${origin}/api/auth/google/callback`;

  // Exchange auth code for an id_token
  let tokenJson: { id_token?: string; error?: string };
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    tokenJson = await tokenRes.json();
  } catch {
    return fail(req, "token_exchange_failed");
  }
  if (!tokenJson.id_token) return fail(req, tokenJson.error || "no_id_token");

  // Hand the id_token to Supabase. The cookie-aware server client will write
  // the sb-* session cookies onto the redirect response we return below.
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb.auth.signInWithIdToken({
    provider: "google",
    token: tokenJson.id_token,
    nonce: nonceCookie,
  });
  if (error || !data?.user) return fail(req, error?.message || "supabase_signin_failed");

  // Ensure a profiles row exists (parity with the previous /auth/callback handler)
  const user = data.user;
  try {
    const { data: existing } = await sb.from("profiles").select("id").eq("id", user.id).single();
    if (!existing) {
      await sb.from("profiles").insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || "",
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || "",
        company_name: user.user_metadata?.company_name || "",
        phone_number: user.user_metadata?.phone_number || "",
      });
    }
  } catch {
    // non-fatal — login still succeeds even if profiles upsert fails
  }

  // Build the redirect response and clear the temporary OAuth cookies
  const res = NextResponse.redirect(new URL(nextCookie, origin));
  const expire = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 0 };
  res.cookies.set("cds_oauth_state", "", expire);
  res.cookies.set("cds_oauth_nonce", "", expire);
  res.cookies.set("cds_oauth_next", "", expire);
  return res;
}
