import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { collectAuditReport } from "@/lib/audit-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Audit & Report page's data.
 *
 * The gathering itself lives in `@/lib/audit-report` so the end-of-day email
 * can report exactly the same figures. This route is auth plus the date range.
 */

function defaultRange() {
  const year = new Date().getUTCFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function parseRange(req: NextRequest) {
  const url = new URL(req.url);
  const defaults = defaultRange();
  const from = url.searchParams.get("from") || defaults.from;
  const to = url.searchParams.get("to") || defaults.to;
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return {
      from: defaults.from,
      to: defaults.to,
      fromIso: `${defaults.from}T00:00:00.000Z`,
      toIso: `${defaults.to}T23:59:59.999Z`,
    };
  }

  return { from, to, fromIso: fromDate.toISOString(), toIso: toDate.toISOString() };
}

export async function GET(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (admin.role !== "super_admin" && !hasPermission(admin.permissions, "audit_report")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const payload = await collectAuditReport(parseRange(req));
  return NextResponse.json({ ok: true, ...payload });
}
