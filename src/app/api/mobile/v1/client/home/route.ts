import { verifyUser } from "@/lib/admin-auth";
import { clientHome } from "@/lib/mobile-client-data";
import { mobileJson } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Dashboard home cards: current projects, recent invoices, recent messages.
// Deliveries come from /api/client/deliveries/recent, as on the web.
export async function GET() {
  const session = await verifyUser();
  if (!session) return mobileJson({ error: "Unauthorized" }, 401);
  return mobileJson(await clientHome(session.user.id));
}
