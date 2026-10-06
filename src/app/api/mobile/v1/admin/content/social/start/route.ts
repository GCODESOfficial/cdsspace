import { NextRequest, NextResponse } from "next/server";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { getProvider } from "@/lib/social/providers";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social/types";
import { publicSiteOrigin } from "@/lib/public-site";
import { signSocialTicket } from "@/lib/admin-mobile-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { platform } (admin bearer) → { url }: the link the app opens in its sign-in
 * sheet to connect a Content Hub social channel. Same permission as the web's
 * connect action (content_hub.schedule). See src/lib/admin-mobile-content.ts.
 */
export async function POST(req: NextRequest) {
  const { session, deny } = await requireContentHub("content_hub.schedule");
  if (deny || !session) return deny || NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const platform = typeof body.platform === "string" && (SOCIAL_PLATFORMS as string[]).includes(body.platform) ? (body.platform as SocialPlatform) : null;
  if (!platform) return NextResponse.json({ ok: false, error: "Choose a valid platform." }, { status: 400 });
  const provider = getProvider(platform);
  if (!provider.isConfigured()) {
    return NextResponse.json({ ok: false, error: `${provider.label} is missing its API credentials in the environment.` }, { status: 400 });
  }
  const adminCookie = req.cookies.get("admin_session")?.value || "";
  const ticket = adminCookie ? signSocialTicket({ platform, state: crypto.randomUUID(), adminCookie }) : null;
  if (!ticket) return NextResponse.json({ ok: false, error: "Could not start the connection." }, { status: 500 });
  return NextResponse.json({
    ok: true,
    url: `${publicSiteOrigin()}/api/mobile/v1/admin/content/social/open?t=${encodeURIComponent(ticket)}`,
    // The web callback finishes on this page; the app closes its sheet there.
    finishPath: "/admin/content-hub/settings",
  });
}
