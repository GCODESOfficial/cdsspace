import { NextRequest } from "next/server";
import { readMobileBody, str } from "@/lib/mobile-api";
import { adminMobileJson, authenticateAdminLogin, issueAdminMobileToken, serializeAdmin } from "@/lib/admin-mobile";
import { clientRequestContext, consumeSecurityRateLimit } from "@/lib/client-login-security";
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from "@/lib/security/email-blocklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => adminMobileJson({ ok: false, error }, status);

// Admin sign-in for the mobile app. Same checks as /api/admin-login; the signed
// admin session comes back as a Bearer token ("cdsa1.…") instead of a cookie.
export async function POST(req: NextRequest) {
  const body = await readMobileBody(req);
  const email = str(body.email).trim();
  const password = str(body.password);
  if (!email || !password) return fail("Email and password are required", 400);
  if (isBlockedEmail(email)) return fail(BLOCKED_EMAIL_MESSAGE, 403);

  const context = await clientRequestContext();
  const [networkBlocked, identityBlocked] = await Promise.all([
    consumeSecurityRateLimit({ bucket: "admin-login-network", identifier: context.ipHash, limit: 30, windowSeconds: 15 * 60, blockSeconds: 15 * 60 }),
    consumeSecurityRateLimit({ bucket: "admin-login-identity", identifier: email.toLowerCase(), limit: 10, windowSeconds: 15 * 60, blockSeconds: 15 * 60 }),
  ]);
  if (networkBlocked || identityBlocked) return fail("Too many sign-in attempts. Wait a while and try again.", 429);

  const result = await authenticateAdminLogin(email, password, {
    source: "admin_login_mobile",
    userAgent: req.headers.get("user-agent") || null,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
  });
  if (!result.ok) return fail(result.status === 401 ? "Invalid email or password" : result.error, result.status);

  const { token, expiresAt, issuedAt } = issueAdminMobileToken(result.claims);
  return adminMobileJson({ ok: true, token, expiresAt, admin: serializeAdmin(result.claims, issuedAt) });
}
