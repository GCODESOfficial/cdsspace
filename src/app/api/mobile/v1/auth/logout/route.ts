import { readRequestMobileToken, revokeClientMobileSession } from "@/lib/client-mobile-session";
import { mobileJson } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Revokes this device's token. Safe to call with an already-revoked token.
export async function POST() {
  const token = await readRequestMobileToken();
  if (token) await revokeClientMobileSession(token, "logout");
  return mobileJson({ ok: true });
}
