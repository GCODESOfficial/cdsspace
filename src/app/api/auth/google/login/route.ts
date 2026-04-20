import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";

/**
 * Step 1 of CDS-Space-hosted Google OAuth.
 *
 * Why this route exists:
 *  We don't want the Google consent screen to read
 *  "to continue to udorpewvuezxxlzedafo.supabase.co". By doing the OAuth
 *  dance on our own domain and then handing the resulting Google ID token
 *  to `supabase.auth.signInWithIdToken` in the callback route, the only
 *  redirect_uri Google ever sees is `https://cdsspace.com/api/auth/google/callback`
 *  — so the consent screen reads "to continue to cdsspace.com".
 *
 * Flow:
 *  1. Generate a CSRF state token + a nonce
 *  2. Persist them in httpOnly cookies (so the callback can verify them)
 *  3. Send the hashed nonce to Google so we can verify the returned id_token
 *  4. Redirect the browser to Google's OAuth consent screen
 */
function getOrigin(req: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID is not configured" }, { status: 500 });
  }

  const next = req.nextUrl.searchParams.get("next") || "/dashboard";
  const origin = getOrigin(req);
  const redirectUri = `${origin}/api/auth/google/callback`;

  // CSRF protection: random state token compared between this request
  // and the callback (via httpOnly cookie).
  const state = randomBytes(24).toString("hex");

  // Replay protection: nonce that we'll embed in the id_token. Google hashes
  // the nonce we send via `nonce=<sha256_of_raw_nonce>`, then echoes the raw
  // nonce back inside the signed id_token. We verify the match in the callback.
  const rawNonce = randomBytes(24).toString("hex");
  const hashedNonce = createHash("sha256").update(rawNonce).digest("hex");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
    nonce: hashedNonce,
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  };
  res.cookies.set("cds_oauth_state", state, cookieOpts);
  res.cookies.set("cds_oauth_nonce", rawNonce, cookieOpts);
  res.cookies.set("cds_oauth_next", next, cookieOpts);
  return res;
}
