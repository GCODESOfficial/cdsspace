/**
 * Notification thread worker.
 *
 * Point a scheduler at GET /api/cron/notification-digest every ~5-15 min
 * (Authorization: Bearer CRON_SECRET). The work itself lives in
 * lib/notification-email-queue so the app can also run it when the scheduler
 * goes quiet, which is what left 129 emails unsent for twelve days.
 */
import { NextRequest, NextResponse } from "next/server";
import { flushNotificationEmailQueue, notificationQueueBacklog } from "@/lib/notification-email-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limit = Number(new URL(req.url).searchParams.get("limit") || 200);
  const result = await flushNotificationEmailQueue(Number.isFinite(limit) ? limit : 200);
  return NextResponse.json({ ok: true, ...result, backlog: await notificationQueueBacklog() });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
