import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync, type AdminSession } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";

/**
 * Generic guard for admin API routes.
 *
 * Accepts BOTH the super-admin cookie and a team-portal sub-admin session
 * (with role-layered permissions). This is the fix for sub-admins being unable
 * to see/act on shared admin data (consultations, legal, roles, etc.) that the
 * super admin sees - data is global, only the auth gate differed.
 *
 * Super admins always pass; sub-admins pass when they hold `permissionKey`
 * (a parent key like "consultations" also matches via the permission-group
 * fallback in hasPermission).
 *
 * Usage:
 *   const { denied } = await requireAdmin(req, "consultations");
 *   if (denied) return denied;
 */
export async function requireAdmin(
  req: NextRequest,
  permissionKey: string,
): Promise<{ session: AdminSession | null; denied: NextResponse | null }> {
  const session = await getAdminSessionAsync(req);
  if (!session) {
    return { session: null, denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.role === "super_admin" || hasPermission(session.permissions, permissionKey)) {
    return { session, denied: null };
  }
  return { session, denied: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}
