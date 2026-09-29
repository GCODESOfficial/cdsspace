import { verifyUser } from "@/lib/admin-auth";
import { clientOrders } from "@/lib/mobile-client-data";
import { mobileJson } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Design, banner, merch and recurring requests in one list, newest first.
export async function GET() {
  const session = await verifyUser();
  if (!session) return mobileJson({ error: "Unauthorized" }, 401);
  return mobileJson({ orders: await clientOrders(session.user.id) });
}
