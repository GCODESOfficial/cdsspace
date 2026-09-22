import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getAdminSessionAsync } from "@/app/api/admin-check/route";
import { getPermissionForRoute, hasPermission } from "@/lib/admin-permissions";
import { canSeeClientIdentity } from "@/lib/client-identity";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Untyped Supabase admin client for finance tables.
 * The generated Database type predates the finance schema,
 * so we use an untyped client to avoid `never` type errors.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function financeDb(): any {
  return getSupabaseAdmin();
}

function inferPermissionFromRequest(req: NextRequest, fallback: string) {
  const pathname = new URL(req.url).pathname.replace(/^\/api\/admin/, "/admin");
  return getPermissionForRoute(pathname) ?? fallback;
}

/**
 * Synchronous guard (admin-cookie only). Kept for routes that haven't been
 * migrated to the async team-session bridge.
 */
export function requireFinanceAdmin(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "super_admin") return null;
  const permissionKey = inferPermissionFromRequest(req, "finance");
  if (!hasPermission(session.permissions, permissionKey)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Whether the caller may be shown client names and contact details.
 *
 * Separate from the route guard because it answers a different question: the
 * guard decides whether the page opens at all, this decides how much of what
 * is on it the reader is allowed to see.
 */
export async function callerSeesClientIdentity(req: NextRequest) {
  const session = await getAdminSessionAsync(req);
  if (!session) return false;
  if (session.role === "super_admin") return true;
  return canSeeClientIdentity(session.permissions);
}

/**
 * Async guard that also accepts a team-portal session for team members with
 * sub-admin access. Use this for any NEW admin API route going forward.
 */
export async function requireFinanceAdminAsync(req: NextRequest, permissionKey = "finance") {
  const session = await getAdminSessionAsync(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "super_admin") return null;
  const resolvedPermissionKey = permissionKey === "finance"
    ? inferPermissionFromRequest(req, permissionKey)
    : permissionKey;
  if (!hasPermission(session.permissions, resolvedPermissionKey)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
