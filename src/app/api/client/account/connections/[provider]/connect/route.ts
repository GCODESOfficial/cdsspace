import { NextRequest, NextResponse } from "next/server";
import { startDirectGoogleLogin } from "@/lib/auth/google-login";
import { startDirectLinkedInLogin } from "@/lib/auth/linkedin-login";
import {
  createClientOAuthLinkIntent,
  isWebClientAuthProvider,
  loadClientProfileIdentity,
  setClientOAuthLinkCookie,
} from "@/lib/auth/client-account-connections";
import { readClientDashboardSession } from "@/lib/client-dashboard-session";
import { absoluteApplicationUrl, applicationOrigin } from "@/lib/public-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isWebClientAuthProvider(provider)) {
    return NextResponse.json({ error: "Unsupported sign-in provider." }, { status: 404 });
  }

  const session = await readClientDashboardSession();
  if (!session) {
    return NextResponse.redirect(absoluteApplicationUrl("/login?error=session_expired", request));
  }
  const activeProfile = await loadClientProfileIdentity(session.subject);
  if (!activeProfile) {
    return NextResponse.redirect(absoluteApplicationUrl("/dashboard/settings?connection=session_failed", request));
  }

  const token = createClientOAuthLinkIntent(session, provider);
  const response = provider === "google"
    ? startDirectGoogleLogin(request)
    : startDirectLinkedInLogin(request);
  const location = response.headers.get("location");
  if (location) {
    try {
      const destination = new URL(location, applicationOrigin(request));
      if (destination.pathname === "/login" || destination.pathname === "/marketer/login") {
        return NextResponse.redirect(absoluteApplicationUrl(`/dashboard/settings?connection=${provider}_failed&detail=${encodeURIComponent(`${provider === "google" ? "Google" : "LinkedIn"} sign-in is not configured yet.`)}`, request));
      }
    } catch {
      return NextResponse.redirect(absoluteApplicationUrl(`/dashboard/settings?connection=${provider}_failed`, request));
    }
  }
  return setClientOAuthLinkCookie(response, token);
}
