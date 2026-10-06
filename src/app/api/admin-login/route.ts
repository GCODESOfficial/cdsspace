import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookieOptions, signAdminCookie } from "@/lib/admin-session-cookie";
import { authenticateAdminLogin } from "@/lib/admin-mobile";
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from "@/lib/security/email-blocklist";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (isBlockedEmail(email)) {
    return NextResponse.json({ ok: false, error: BLOCKED_EMAIL_MESSAGE }, { status: 403 });
  }
  const result = await authenticateAdminLogin(email, password, {
    source: "admin_login",
    userAgent: req.headers.get("user-agent") || null,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const response = NextResponse.json({ success: true });
  response.cookies.set("admin_session", signAdminCookie({ ...result.claims }), adminSessionCookieOptions());
  return response;
}
