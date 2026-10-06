import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createHandoffCode } from "@/lib/mobile-handoff";

/**
 * Google/LinkedIn sign-in started from the mobile app. The normal web OAuth
 * flow runs unchanged (same registered redirect URIs); this cookie only changes
 * the last step: instead of a web session and a dashboard redirect, the browser
 * is sent back to the app's own link with a one-time code (or an error).
 */

export const MOBILE_OAUTH_COOKIE = "cds_oauth_mobile_redirect";

/**
 * Only the app's own scheme may receive a code, so a crafted link cannot send a
 * sign-in to another app. Expo Go (exp://) is allowed outside production.
 */
export function allowedAppRedirect(value: unknown) {
  if (typeof value !== "string" || value.length > 300) return null;
  if (/^cdsspace:\/\/[\w./-]*$/i.test(value)) return value;
  if (process.env.NODE_ENV !== "production" && /^exps?:\/\/[\w.:-]+(\/--)?\/[\w./-]*$/i.test(value)) return value;
  return null;
}

export function mobileOAuthCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function clearMobileOAuthCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(MOBILE_OAUTH_COOKIE, "", mobileOAuthCookieOptions(0));
  return response;
}

function appRedirect(base: string, params: Record<string, string>) {
  const separator = base.includes("?") ? "&" : "?";
  return clearMobileOAuthCookie(
    NextResponse.redirect(`${base}${separator}${new URLSearchParams(params).toString()}`, 302),
  );
}

export function readMobileOAuthRedirect(request: NextRequest) {
  return allowedAppRedirect(request.cookies.get(MOBILE_OAUTH_COOKIE)?.value);
}

/** An OAuth failure for an app sign-in: back to the app with the reason. */
export function mobileOAuthFailure(request: NextRequest, reason: string) {
  const redirect = readMobileOAuthRedirect(request);
  return redirect ? appRedirect(redirect, { error: reason }) : null;
}

/**
 * The finalised OAuth result for an app sign-in: a one-time code the app
 * exchanges for its device session. Marketer and blocked accounts are refused.
 */
export async function mobileOAuthSuccess(
  request: NextRequest,
  payload: { ok?: unknown; clientUserId?: unknown; email?: unknown; error?: unknown },
) {
  const redirect = readMobileOAuthRedirect(request);
  if (!redirect) return null;
  if (payload.ok !== true || typeof payload.clientUserId !== "string") {
    return appRedirect(redirect, {
      error: typeof payload.error === "string" ? payload.error : "This account cannot sign in to the CDS Space client app.",
    });
  }
  const code = await createHandoffCode({
    purpose: "app_signin",
    userId: payload.clientUserId,
    email: typeof payload.email === "string" ? payload.email : "",
  });
  return appRedirect(redirect, { code });
}
