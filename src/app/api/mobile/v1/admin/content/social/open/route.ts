import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/social/providers";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social/types";
import { callbackRedirectUri } from "@/app/api/admin/content-hub/social/route";
import { publicSiteOrigin } from "@/lib/public-site";
import { consumeSocialTicket, verifySocialTicket } from "@/lib/admin-mobile-content";
import { verifyAdminCookie } from "@/lib/admin-session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CALLBACK_PATH = "/api/admin/content-hub/social/callback";
// Long enough for the platform's sign-in and the callback; nothing else sees it.
const ADMIN_COOKIE_SECONDS = 300;

// The ticket is in this request's URL: never cache it or pass it on as a referrer.
function harden(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function fail(platform: string, detail: string) {
  const url = new URL("/admin/content-hub/settings", publicSiteOrigin());
  url.searchParams.set("channel", platform);
  url.searchParams.set("social", "error");
  url.searchParams.set("detail", detail);
  return harden(NextResponse.redirect(url.toString()));
}

/**
 * GET ?t=<ticket> (opened in the app's sign-in sheet): burns the single-use ticket,
 * sets the two cookies the existing web callback checks - the admin session, scoped
 * to the callback path for five minutes, and the OAuth state for the ticket's own
 * platform - then continues to the platform's sign-in.
 */
export async function GET(req: NextRequest) {
  const ticket = verifySocialTicket(req.nextUrl.searchParams.get("t"));
  if (!ticket) return fail("channel", "The connection link expired. Start again.");
  if (!(SOCIAL_PLATFORMS as string[]).includes(ticket.platform)) return fail(ticket.platform, "Unknown platform");
  if (!verifyAdminCookie(ticket.adminCookie)) return fail(ticket.platform, "Sign in as an admin and try connecting again");
  // Single use: a second open of the same link is refused.
  if (!(await consumeSocialTicket(ticket.jti))) return fail(ticket.platform, "This connection link was already used. Start again.");
  const platform = ticket.platform as SocialPlatform;
  const provider = getProvider(platform);
  if (!provider.isConfigured()) return fail(platform, `${provider.label} is missing its API credentials.`);

  const response = NextResponse.redirect(provider.getAuthUrl({ redirectUri: callbackRedirectUri(platform), state: ticket.state }));
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("admin_session", ticket.adminCookie, { httpOnly: true, secure, sameSite: "lax", path: CALLBACK_PATH, maxAge: ADMIN_COOKIE_SECONDS });
  response.cookies.set("social_oauth_state", `${platform}.${ticket.state}`, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: ADMIN_COOKIE_SECONDS });
  return harden(response);
}
