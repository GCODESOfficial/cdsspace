import { verifyUser } from "@/lib/admin-auth";
import { createHandoffCode } from "@/lib/mobile-handoff";
import { safeClientPath } from "@/lib/client-account";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";
import { publicSiteOrigin } from "@/lib/public-site";

export const dynamic = "force-dynamic";

/**
 * The app wants to open a web page that needs a signed-in browser (a cMeet room,
 * a private report, connecting Google/LinkedIn). Returns a single-use link, valid
 * for two minutes, that signs the in-app browser in as this client and then
 * redirects to `path` (a path on this site only).
 */
export async function POST(request: Request) {
  const session = await verifyUser();
  if (!session) return mobileJson({ error: "Unauthorized" }, 401);
  const body = await readMobileBody(request);
  const requested = str(body.path);
  // Paths on this site only. Backslashes are refused because browsers read
  // "/\\host" as "//host", which would leave the site.
  const path = /[\\\s]/.test(requested) || /^\/(admin|team|marketer|api\/mobile)(\/|$)/.test(requested)
    ? "/dashboard"
    : safeClientPath(requested || null, "/dashboard");
  const code = await createHandoffCode({
    purpose: "web_session",
    userId: session.user.id,
    email: session.user.email,
    targetPath: path,
  });
  const origin = process.env.NODE_ENV === "production" ? publicSiteOrigin() : new URL(request.url).origin;
  return mobileJson({ url: `${origin}/api/mobile/v1/auth/web-handoff/open?code=${encodeURIComponent(code)}` });
}
