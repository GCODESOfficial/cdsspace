import { NextRequest, NextResponse } from "next/server";
import { startDirectGoogleLogin } from "@/lib/auth/google-login";
import { startDirectLinkedInLogin } from "@/lib/auth/linkedin-login";
import { MOBILE_OAUTH_COOKIE, allowedAppRedirect, mobileOAuthCookieOptions } from "@/lib/auth/mobile-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER_HOSTS: Record<string, string> = {
  google: "accounts.google.com",
  linkedin: "www.linkedin.com",
};

/**
 * Start Google/LinkedIn sign-in for the mobile app, opened in the app's secure
 * browser: GET /api/mobile/v1/auth/oauth/google?redirect=cdsspace://auth
 * Runs the normal web OAuth flow and marks it as an app sign-in; the callback
 * then returns to `redirect` with ?code= (exchange it) or ?error=.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const redirect = allowedAppRedirect(request.nextUrl.searchParams.get("redirect"));
  if (!redirect) return NextResponse.json({ error: "Invalid app redirect." }, { status: 400 });
  if (!PROVIDER_HOSTS[provider]) {
    return NextResponse.redirect(`${redirect}?error=unsupported_provider`, 302);
  }

  const response = provider === "google" ? startDirectGoogleLogin(request) : startDirectLinkedInLogin(request);
  // Not configured (the start helpers fall back to the web login page): tell the app.
  const location = response.headers.get("location") || "";
  if (!location.includes(PROVIDER_HOSTS[provider])) {
    return NextResponse.redirect(`${redirect}?error=${provider}_disabled`, 302);
  }
  response.cookies.set(MOBILE_OAUTH_COOKIE, redirect, mobileOAuthCookieOptions(600));
  return response;
}
