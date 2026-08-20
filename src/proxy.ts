import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/glashdb/middleware";
import { guardIncomingRequest } from "@/lib/security/request-guard";

export async function proxy(request: NextRequest) {
  const blocked = guardIncomingRequest(request);
  if (blocked) return blocked;
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
