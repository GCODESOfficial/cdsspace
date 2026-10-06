import { NextRequest } from "next/server";
import { getAdminSession, getAdminSessionAsync } from "@/app/api/admin-check/route";
import { verifyAdminCookie } from "@/lib/admin-session-cookie";
import { adminMobileJson, serializeAdmin } from "@/lib/admin-mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The signed-in admin, refreshed whenever the app opens (sub-admin permissions
// and role come from the database). 401 once the session has ended.
export async function GET(req: NextRequest) {
  const issuedAt = verifyAdminCookie<{ issuedAt?: string }>(req.cookies.get("admin_session")?.value)?.issuedAt;
  let session;
  try {
    session = await getAdminSessionAsync(req);
  } catch {
    // The signed token is itself proof of a live session; keep its claims.
    session = getAdminSession(req);
    if (!session) return adminMobileJson({ ok: false, temporarilyUnavailable: true, error: "The admin portal is temporarily unavailable." }, 503);
  }
  if (!session) return adminMobileJson({ ok: false, error: "Your admin session has ended. Sign in again." }, 401);
  return adminMobileJson({ ok: true, admin: serializeAdmin({ ...session, name: session.name }, issuedAt) });
}
