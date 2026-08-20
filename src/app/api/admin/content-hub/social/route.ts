import { NextRequest, NextResponse } from "next/server";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { publicSiteOrigin } from "@/lib/public-site";
import { deleteConnection, listConnectionSummaries } from "@/lib/social/connections";
import { getProvider } from "@/lib/social/providers";
import { SOCIAL_PLATFORMS, SocialError, type SocialPlatform } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asPlatform(value: unknown): SocialPlatform | null {
  return typeof value === "string" && (SOCIAL_PLATFORMS as string[]).includes(value) ? (value as SocialPlatform) : null;
}

export function callbackRedirectUri(platform: SocialPlatform) {
  return `${publicSiteOrigin()}/api/admin/content-hub/social/callback/${platform}`;
}

export async function GET() {
  const { deny } = await requireContentHub("content_hub.view");
  if (deny) return deny;
  return NextResponse.json({ ok: true, channels: await listConnectionSummaries() });
}

export async function POST(req: NextRequest) {
  const { session, deny } = await requireContentHub("content_hub.schedule");
  if (deny || !session) return deny || NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const platform = asPlatform(body.platform);
  if (!platform) return NextResponse.json({ ok: false, error: "Choose a valid platform." }, { status: 400 });

  try {
    const provider = getProvider(platform);

    if (action === "disconnect") {
      await deleteConnection(platform);
      return NextResponse.json({ ok: true });
    }

    if (action === "connect") {
      if (!provider.isConfigured()) {
        return NextResponse.json({ ok: false, error: `${provider.label} is missing its API credentials in the environment.` }, { status: 400 });
      }
      const state = crypto.randomUUID();
      const authUrl = provider.getAuthUrl({ redirectUri: callbackRedirectUri(platform), state });
      const response = NextResponse.json({ ok: true, authUrl });
      // Short-lived CSRF/state cookie verified in the callback.
      response.cookies.set("social_oauth_state", `${platform}.${state}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });
      return response;
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const status = error instanceof SocialError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Request failed." }, { status });
  }
}
