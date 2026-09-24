import { NextRequest, NextResponse } from "next/server";
import { dispatchPendingClientNotifications } from "@/lib/notification-delivery";
import { flushNotificationEmailBatches } from "@/lib/notification-email-batching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sweeps client notices that no route delivered inline, so nothing raised
 * anywhere in the platform stays trapped in the bell.
 */
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
    const result = await dispatchPendingClientNotifications({ dryRun });
    // Summaries for anyone whose quiet window has closed.
    const batches = await flushNotificationEmailBatches({ dryRun });
    return NextResponse.json({ ok: true, ...result, batches });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Dispatch failed." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
