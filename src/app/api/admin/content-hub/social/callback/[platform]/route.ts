import { NextRequest, NextResponse } from "next/server";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { publicSiteOrigin } from "@/lib/public-site";
import { logActivity } from "@/lib/activity-log";
import { saveConnection } from "@/lib/social/connections";
import { getProvider } from "@/lib/social/providers";
import { SOCIAL_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social/types";
import { callbackRedirectUri } from "@/app/api/admin/content-hub/social/route";
import { completeDirectLinkedInLogin } from "@/lib/auth/linkedin-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_PATH = "/admin/content-hub/settings";

function back(status: string, platform: string, detail?: string) {
  const url = new URL(SETTINGS_PATH, publicSiteOrigin());
  url.searchParams.set("channel", platform);
  url.searchParams.set("social", status);
  if (detail) url.searchParams.set("detail", detail.slice(0, 140));
  return NextResponse.redirect(url.toString());
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform: raw } = await params;
  const platform = (SOCIAL_PLATFORMS as string[]).includes(raw) ? (raw as SocialPlatform) : null;
  if (!platform) return back("error", raw, "Unknown platform");

  // LinkedIn login shares this already-approved callback URL with the admin
  // social-channel connection flow. Its own HttpOnly state cookie disambiguates
  // the request before the admin permission check below.
  if (platform === "linkedin") {
    const loginResponse = await completeDirectLinkedInLogin(req);
    if (loginResponse) return loginResponse;
  }

  // Only an authenticated content-hub admin may complete a connection.
  const { session, deny } = await requireContentHub("content_hub.schedule");
  if (deny || !session) return back("error", platform, "Sign in as an admin and try connecting again");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error_description") || req.nextUrl.searchParams.get("error");
  if (oauthError) return back("error", platform, oauthError);
  if (!code || !state) return back("error", platform, "Missing authorization code");

  // Verify the state cookie set when the connect flow started.
  const cookie = req.cookies.get("social_oauth_state")?.value || "";
  const [cookiePlatform, cookieState] = cookie.split(".");
  if (cookiePlatform !== platform || cookieState !== state) {
    return back("error", platform, "The connection link expired. Start again.");
  }

  try {
    const provider = getProvider(platform);
    const stored = await provider.exchangeCode({ code, redirectUri: callbackRedirectUri(platform) });
    await saveConnection(platform, stored, session.email);
    await logActivity({
      action: "content.social_connect",
      page: "content-hub/settings",
      resource_type: "social_connection",
      resource_id: platform,
      resource_label: `${SOCIAL_LABELS[platform]}: ${stored.accountName || "connected"}`,
      metadata: { platform, account: stored.accountName },
    });
    const response = back("connected", platform, stored.accountName || undefined);
    response.cookies.set("social_oauth_state", "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return back("error", platform, error instanceof Error ? error.message : "Connection failed");
  }
}
