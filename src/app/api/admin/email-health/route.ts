import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { verifyEmailReady, EMAIL_MODE, EMAIL_FROM } from "@/lib/email-from";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only email transport check. GET /api/admin/email-health confirms the
 * active transport is usable (Resend key present, or SMTP reachable) without
 * sending a real email.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const meta =
    EMAIL_MODE === "smtp"
      ? { mode: "smtp", from: EMAIL_FROM, host: process.env.EMAIL_HOST || "smtp.gmail.com", port: Number(process.env.EMAIL_PORT || 587) }
      : { mode: EMAIL_MODE, from: EMAIL_FROM };

  const error = await verifyEmailReady();
  if (error) return NextResponse.json({ ok: false, ...meta, error }, { status: 502 });

  const okMessage: Record<typeof EMAIL_MODE, string> = {
    gmail_api: "Gmail API auth OK - ready to send over HTTPS.",
    resend: "Resend key present - ready to send over HTTPS.",
    smtp: "SMTP reachable and credentials accepted.",
  };
  return NextResponse.json({ ok: true, ...meta, message: okMessage[EMAIL_MODE] });
}
