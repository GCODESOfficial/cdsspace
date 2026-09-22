import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { finalizeClientOAuthSignIn } from "@/lib/client-oauth";
import { oauthFailurePage, safeOAuthNext } from "@/lib/auth/dashboard-oauth";
import { publicSiteOrigin } from "@/lib/public-site";
import {
  clearClientOAuthLinkCookie,
  completeClientOAuthLinkAttempt,
} from "@/lib/auth/client-account-connections";
import { prepareDirectOAuthUser } from "@/lib/auth/direct-oauth-user";

const STATE_COOKIE = "cds_linkedin_login_state";
const NEXT_COOKIE = "cds_oauth_next";
const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const LOGIN_SCOPES = "openid profile email";

type LinkedInUserInfo = {
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
    clientId: process.env.LINKEDIN_CLIENT_ID?.trim() || "",
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET?.trim() || "",
  };
}

function loginCallbackUri() {
  // This callback is already registered for the Content Hub LinkedIn flow.
  // A separate, HttpOnly state cookie safely dispatches login callbacks before
  // the admin-only content connection handler runs.
  return `${publicSiteOrigin()}/api/admin/content-hub/social/callback/linkedin`;
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

function clearLoginCookies(response: NextResponse) {
  response.cookies.set(STATE_COOKIE, "", cookieOptions(0));
  response.cookies.set(NEXT_COOKIE, "", cookieOptions(0));
  return response;
}

function validState(expected: string, supplied: string) {
  if (!expected || !supplied || expected.length > 256 || supplied.length > 256) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Start LinkedIn login without routing through Glash's currently failing
 * LinkedIn adapter. The LinkedIn client secret remains server-only.
 */
export function startDirectLinkedInLogin(request: NextRequest) {
  const next = safeOAuthNext(request.nextUrl.searchParams.get("next"));
  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) return loginError(next, "linkedin_disabled");

  const state = randomBytes(32).toString("base64url");
  const authorize = new URL(AUTHORIZE_URL);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", loginCallbackUri());
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("scope", LOGIN_SCOPES);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, state, cookieOptions(600));
  response.cookies.set(NEXT_COOKIE, next, cookieOptions(600));
  return response;
}

async function exchangeCode(code: string) {
  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) throw new Error("LinkedIn credentials are unavailable.");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: loginCallbackUri(),
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const token = await response.json().catch(() => ({})) as { access_token?: unknown };
  if (!response.ok || typeof token.access_token !== "string" || !token.access_token) {
    throw new Error("LinkedIn rejected the authorization code.");
  }
  return token.access_token;
}

async function readLinkedInUser(accessToken: string) {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const profile = await response.json().catch(() => ({})) as LinkedInUserInfo;
  const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  if (!response.ok || typeof profile.sub !== "string" || !profile.sub || !email) {
    throw new Error("LinkedIn did not return an email address.");
  }
  if (profile.email_verified === false) {
    throw new Error("LinkedIn has not verified this email address.");
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

/**
 * Complete a direct LinkedIn login when the shared LinkedIn callback receives
 * a matching login state cookie. Returns null for ordinary admin Content Hub
 * connection callbacks so their existing flow remains unchanged.
 */
export async function completeDirectLinkedInLogin(request: NextRequest): Promise<NextResponse | null> {
  const expectedState = request.cookies.get(STATE_COOKIE)?.value || "";
  if (!expectedState) return null;

  const next = safeOAuthNext(request.cookies.get(NEXT_COOKIE)?.value || null);
  const suppliedState = request.nextUrl.searchParams.get("state") || "";
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) return clearLoginCookies(loginError(next, "linkedin_cancelled"));
  if (!validState(expectedState, suppliedState)) {
    return clearLoginCookies(loginError(next, "linkedin_state_failed"));
  }

  const code = request.nextUrl.searchParams.get("code") || "";
  if (!code || code.length > 4096) {
    return clearLoginCookies(loginError(next, "linkedin_callback_failed"));
  }

  try {
    const accessToken = await exchangeCode(code);
    const linkedInProfile = await readLinkedInUser(accessToken);
    const user = await prepareDirectOAuthUser({ provider: "linkedin", ...linkedInProfile });
    const linkAttempt = await completeClientOAuthLinkAttempt(request, user, "linkedin");
    if (linkAttempt) {
      const linkedResponse = clearClientOAuthLinkCookie(
        NextResponse.redirect(new URL(linkAttempt.next, publicSiteOrigin())),
      );
      return clearLoginCookies(linkedResponse);
    }
    const finalized = await finalizeClientOAuthSignIn({
      auth: { signOut: async () => undefined },
      user,
      next,
    });
    const payload = await finalized.clone().json().catch(() => ({})) as { next?: unknown };
    const destination = typeof payload.next === "string" ? safeOAuthNext(payload.next) : oauthFailurePage(next);
    const response = copyResponseCookies(
      finalized,
      NextResponse.redirect(new URL(destination, publicSiteOrigin())),
    );
    return clearLoginCookies(response);
  } catch (error) {
    console.error("[client-auth] Direct LinkedIn sign-in failed", error instanceof Error ? error.message : "Unknown error");
    return clearLoginCookies(loginError(next, "linkedin_callback_failed"));
  }
}
