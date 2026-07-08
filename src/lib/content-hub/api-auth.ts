/**
 * Shared auth guard for Content Hub API routes. Mirrors the project's other
 * admin guards: super_admin passes everything; sub-admins need the relevant
 * content_hub permission (bridged from their team session by getAdminSession).
 */
import { NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";

export interface ContentHubGuard {
  session: AdminSession | null;
  deny: NextResponse | null;
}

export async function requireContentHub(permission = "content_hub"): Promise<ContentHubGuard> {
  const session = await getAdminSession();
  if (!session) {
    return { session: null, deny: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.role === "super_admin" || hasPermission(session.permissions || [], permission)) {
    return { session, deny: null };
  }
  return { session: null, deny: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
}
