import { NextRequest } from "next/server";
import { startDirectLinkedInLogin } from "@/lib/auth/linkedin-login";

/**
 * Start LinkedIn's documented OIDC authorization-code flow directly. GlashDB's
 * native LinkedIn authorize adapter currently returns HTTP 500 before reaching
 * LinkedIn; the direct server-side exchange still ends in the same durable CDS
 * Space client/marketer session used by every other sign-in method.
 */
export async function GET(req: NextRequest) {
  return startDirectLinkedInLogin(req);
}
