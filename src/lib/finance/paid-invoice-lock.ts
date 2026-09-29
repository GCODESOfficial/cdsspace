import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";

export const PAID_INVOICE_LOCK_MESSAGE = "This invoice is paid and locked. Only a super admin can edit it.";

/**
 * A paid invoice is a settled financial record: its receipt has been issued and
 * the client has been told the balance is cleared. Only a super admin may change
 * it afterwards. Returns a 403 response when the caller must be refused.
 */
export async function denyPaidInvoiceEdit(
  req: NextRequest,
  invoice: { status?: string | null } | null | undefined,
): Promise<NextResponse | null> {
  if (invoice?.status !== "paid") return null;
  const session = await getAdminSessionAsync(req);
  if (session?.role === "super_admin") return null;
  return NextResponse.json({ error: PAID_INVOICE_LOCK_MESSAGE, locked: true }, { status: 403 });
}
