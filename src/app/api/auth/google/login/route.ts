import { NextRequest } from "next/server";
import { startDirectGoogleLogin } from "@/lib/auth/google-login";

/**
 * Start Google's documented server-side OIDC flow directly. GlashDB's native
 * Google authorize adapter currently returns HTTP 500 before reaching Google;
 * the direct callback still creates the same durable CDS Space dashboard session.
 */
export async function GET(req: NextRequest) {
  return startDirectGoogleLogin(req);
}
