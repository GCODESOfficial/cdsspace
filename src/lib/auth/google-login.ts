import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { finalizeClientOAuthSignIn } from "@/lib/client-oauth";
import { oauthFailurePage, safeOAuthNext } from "@/lib/auth/dashboard-oauth";
import {
  clearClientOAuthLinkCookie,
  completeClientOAuthLinkAttempt,
} from "@/lib/auth/client-account-connections";
import { prepareDirectOAuthUser } from "@/lib/auth/direct-oauth-user";
import { publicSiteOrigin } from "@/lib/public-site";
import { clearMobileOAuthCookie, mobileOAuthFailure, mobileOAuthSuccess } from "@/lib/auth/mobile-oauth";

const STATE_COOKIE = "cds_google_login_state";
const VERIFIER_COOKIE = "cds_google_login_verifier";
const NEXT_COOKIE = "cds_oauth_next";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const LOGIN_SCOPES = "openid email profile";

type GoogleUserInfo = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  picture?: unknown;
};

function credentials() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
  };
}

export function googleLoginCallbackUri() {
  // This exact URI is already registered on the production Google OAuth
  // client. The page immediately hands code + state to our server callback;
  // changing the registered path would produce redirect_uri_mismatch.
  return `${publicSiteOrigin()}/auth/callback`;
}

function loginError(next: string, code: string) {
  const target = new URL(oauthFailurePage(next), publicSiteOrigin());
  target.searchParams.set("error", code);
  return NextResponse.redirect(target);
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function clearLoginCookies<T extends NextResponse>(response: T): T {
  clearMobileOAuthCookie(response);
  response.cookies.set(STATE_COOKIE, "", cookieOptions(0));
  response.cookies.set(VERIFIER_COOKIE, "", cookieOptions(0));
  response.cookies.set(NEXT_COOKIE, "", cookieOptions(0));
  return clearClientOAuthLinkCookie(response);
}

function validState(expected: string, supplied: string) {
  if (!expected || !supplied || expected.length > 256 || supplied.length > 256) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Start direct Google OIDC and bypass GlashDB's failing authorize adapter. */
export function startDirectGoogleLogin(request: NextRequest) {
  const next = safeOAuthNext(request.nextUrl.searchParams.get("next"));
  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) return loginError(next, "google_disabled");

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const authorize = new URL(AUTHORIZE_URL);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", googleLoginCallbackUri());
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", LOGIN_SCOPES);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", pkceChallenge(verifier));
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("include_granted_scopes", "true");
  // Choosing an account is what keeps two unlinked Google identities as two
  // separate CDS Space entries instead of silently reusing the last browser account.
  authorize.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, state, cookieOptions(600));
  response.cookies.set(VERIFIER_COOKIE, verifier, cookieOptions(600));
  response.cookies.set(NEXT_COOKIE, next, cookieOptions(600));
  return response;
}

async function exchangeCode(code: string, verifier: string) {
  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) throw new Error("Google credentials are unavailable.");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: googleLoginCallbackUri(),
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const token = await response.json().catch(() => ({})) as { access_token?: unknown };
  if (!response.ok || typeof token.access_token !== "string" || !token.access_token) {
    throw new Error("Google rejected the authorization code.");
  }
  return token.access_token;
}

async function readGoogleUser(accessToken: string) {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const profile = await response.json().catch(() => ({})) as GoogleUserInfo;
  const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  if (!response.ok || typeof profile.sub !== "string" || !profile.sub || !email) {
    throw new Error("Google did not return an email address.");
  }
  if (profile.email_verified !== true) {
    throw new Error("Google has not verified this email address.");
  }
  return {
    subject: profile.sub,
    email,
    name: typeof profile.name === "string" ? profile.name.trim() : "",
    givenName: typeof profile.given_name === "string" ? profile.given_name.trim() : "",
    familyName: typeof profile.family_name === "string" ? profile.family_name.trim() : "",
    picture: typeof profile.picture === "string" ? profile.picture : "",
  };
}

function copyResponseCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

export async function completeDirectGoogleLogin(request: NextRequest) {
  const next = safeOAuthNext(request.cookies.get(NEXT_COOKIE)?.value || null);
  const expectedState = request.cookies.get(STATE_COOKIE)?.value || "";
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value || "";
  const suppliedState = request.nextUrl.searchParams.get("state") || "";
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) return clearLoginCookies(mobileOAuthFailure(request, "google_cancelled") || loginError(next, "google_cancelled"));
  if (!validState(expectedState, suppliedState) || verifier.length < 43 || verifier.length > 128) {
    return clearLoginCookies(mobileOAuthFailure(request, "google_state_failed") || loginError(next, "google_state_failed"));
  }

  const code = request.nextUrl.searchParams.get("code") || "";
  if (!code || code.length > 4096) {
    return clearLoginCookies(mobileOAuthFailure(request, "google_callback_failed") || loginError(next, "google_callback_failed"));
  }

  try {
    const accessToken = await exchangeCode(code, verifier);
    const googleProfile = await readGoogleUser(accessToken);
    const user = await prepareDirectOAuthUser({ provider: "google", ...googleProfile });
    const linkAttempt = await completeClientOAuthLinkAttempt(request, user, "google");
    if (linkAttempt) {
      return clearLoginCookies(NextResponse.redirect(new URL(linkAttempt.next, publicSiteOrigin())));
    }
    const finalized = await finalizeClientOAuthSignIn({
      auth: { signOut: async () => undefined },
      user,
      next,
    });
    const payload = await finalized.clone().json().catch(() => ({})) as { next?: unknown; ok?: unknown; clientUserId?: unknown; email?: unknown; error?: unknown };
    // Started from the mobile app: hand the app a one-time code, no web session.
    const mobile = await mobileOAuthSuccess(request, payload);
    if (mobile) return clearLoginCookies(mobile);
    const destination = typeof payload.next === "string" ? safeOAuthNext(payload.next) : oauthFailurePage(next);
    const response = copyResponseCookies(
      finalized,
      NextResponse.redirect(new URL(destination, publicSiteOrigin())),
    );
    return clearLoginCookies(response);
  } catch (error) {
    console.error("[client-auth] Direct Google sign-in failed", error instanceof Error ? error.message : "Unknown error");
    return clearLoginCookies(mobileOAuthFailure(request, "google_callback_failed") || loginError(next, "google_callback_failed"));
  }
}
