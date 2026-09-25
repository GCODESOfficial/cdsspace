import { NextRequest, NextResponse } from "next/server";
import { EMAIL_FROM, EMAIL_MODE, sendEmail, verifyEmailReady } from "@/lib/email-from";
import { notificationQueueBacklog } from "@/lib/notification-email-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether this server can actually send email.
 *
 * The admin-only health page cannot be read from outside, so a silent outage
 * was invisible: mail stopped for twelve days with nothing to show for it.
 * This answers the same question to anyone holding the cron secret, and can
 * send one real test message when asked.
 */
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const transportError = await verifyEmailReady().catch((error) => String(error?.message || error));
  const backlog = await notificationQueueBacklog().catch(() => ({ pending: -1, failing: -1, oldestMinutes: -1 }));
  const testTo = new URL(req.url).searchParams.get("test");

  let testResult: string | null = null;
  if (testTo && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(testTo)) {
    try {
      await sendEmail({
        to: testTo,
        subject: "CDS Space email test",
        text: "This is a test from the CDS Space email health check. If you are reading it, sending works from the live server.",
        fromName: "CDS Space",
      });
      testResult = "sent";
    } catch (error) {
      testResult = `failed: ${error instanceof Error ? error.message.slice(0, 300) : "unknown"}`;
    }
  }

  return NextResponse.json({
    ok: !transportError,
    transport: EMAIL_MODE,
    from: EMAIL_FROM,
    transportError: transportError || null,
    queue: backlog,
    queueMode: process.env.EMAIL_NOTIFICATION_QUEUE === "on" ? "queued, flushed by the worker" : "sent immediately",
    test: testResult,
    hint: EMAIL_MODE === "smtp"
      ? "SMTP is the last-resort transport and many hosts block its ports. Set RESEND_API_KEY, or Gmail API credentials, to send over HTTPS."
      : null,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
