import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { glashQuery } from "@/lib/glashdb/postgres";
import { EMAIL_FROM, EMAIL_MODE, verifyEmailReady } from "@/lib/email-from";
import { pushPublicKey } from "@/lib/web-push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only production self-check.
 *
 * Reports what actually works on the running server: whether email can be
 * sent, whether browser push is configured, and whether the reads the
 * dashboards depend on return rows. Symptoms like "the dashboard is not
 * reading data" or "the code never arrives" are otherwise invisible from
 * outside, since every route answers Unauthorized to anyone not signed in.
 */
const READS: Array<{ name: string; sql: string }> = [
  { name: "profiles", sql: "select count(*)::int as n from public.profiles" },
  { name: "team_members", sql: "select count(*)::int as n from public.team_members where is_active = true" },
  { name: "team_notifications", sql: "select count(*)::int as n from public.team_notifications" },
  { name: "notifications", sql: "select count(*)::int as n from public.notifications" },
  { name: "team_chat_threads", sql: "select count(*)::int as n from public.team_chat_threads" },
  { name: "task_board_tasks", sql: "select count(*)::int as n from public.task_board_tasks" },
  { name: "client_deliveries", sql: "select count(*)::int as n from public.client_deliveries" },
  { name: "push_subscriptions", sql: "select count(*)::int as n from public.push_subscriptions" },
  { name: "notification_email_batches", sql: "select count(*)::int as n from public.notification_email_batches where sent_at is null" },
];

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const reads = await Promise.all(READS.map(async (read) => {
    const started = Date.now();
    try {
      const rows = await glashQuery<{ n: number }>(read.sql);
      return { name: read.name, ok: true, rows: rows[0]?.n ?? 0, ms: Date.now() - started };
    } catch (error) {
      return {
        name: read.name,
        ok: false,
        ms: Date.now() - started,
        code: String((error as { code?: unknown })?.code || ""),
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      };
    }
  }));

  const emailError = await verifyEmailReady().catch((error) => String(error?.message || error));

  return NextResponse.json({
    ok: reads.every((read) => read.ok) && !emailError,
    checkedAt: new Date().toISOString(),
    email: {
      mode: EMAIL_MODE,
      from: EMAIL_FROM,
      ok: !emailError,
      error: emailError || null,
      hint: EMAIL_MODE === "smtp"
        ? "SMTP is the last-resort transport. Many hosts block outbound SMTP ports, which shows up as 'the verification email could not be sent'. Set RESEND_API_KEY, or the Gmail API credentials, to send over HTTPS instead."
        : null,
    },
    push: { configured: Boolean(pushPublicKey()) },
    database: {
      allReadsOk: reads.every((read) => read.ok),
      slowestMs: Math.max(...reads.map((read) => read.ms)),
      reads,
    },
  });
}
