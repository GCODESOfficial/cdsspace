import { verifyUser } from "@/lib/admin-auth";
import { clientInvoices } from "@/lib/mobile-client-data";
import { mobileJson } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Invoices linked to the account ID. Each has the public invoice URL for
// viewing, receipts and payment.
export async function GET() {
  const session = await verifyUser();
  if (!session) return mobileJson({ error: "Unauthorized" }, 401);
  return mobileJson({ invoices: await clientInvoices(session.user.id) });
}
