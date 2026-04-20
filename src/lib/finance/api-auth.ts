import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
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

/**
 * Gate a finance API route. Returns null if authorized,
 * or a NextResponse to return immediately if not.
 */
export function requireFinanceAdmin(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "super_admin") return null;
  if (!hasPermission(session.permissions, "finance")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
