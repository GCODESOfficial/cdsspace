import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/glashdb/middleware";
import { guardIncomingRequest } from "@/lib/security/request-guard";
import { adminMobileSessionLive, parseAdminBearer } from "@/lib/admin-mobile-session-core.mjs";
import { verifyAdminCookie } from "@/lib/admin-session-cookie";

export async function proxy(request: NextRequest) {
  const blocked = guardIncomingRequest(request);
  if (blocked) return blocked;
  const admin = adminBearerRequest(request);
  if (admin) return admin;
  return updateSession(request);
}

/**
 * The mobile app's admin session ("Authorization: Bearer cdsa1.<signed value>")
 * is handed to API routes as the admin_session cookie, so every admin guard
 * (cookie readers, getAdminSessionAsync, requireAdmin, verifyAdmin) applies to
 * the app unchanged. The cookie header is replaced, not merged, so a stray
 * cookie in the phone's cookie jar never stands in for the app's session.
 */
function adminBearerRequest(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return null;
  const value = parseAdminBearer(request.headers.get("authorization"));
  if (!value) return null;
  const claims = verifyAdminCookie<{ issuedAt?: string }>(value);
  if (!claims || !adminMobileSessionLive(claims.issuedAt)) {
    return NextResponse.json(
      { ok: false, error: "Your admin session has ended. Sign in again." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const headers = new Headers(request.headers);
  headers.set("cookie", `admin_session=${value}`);
  headers.delete("authorization");
  headers.set("x-cds-client-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
