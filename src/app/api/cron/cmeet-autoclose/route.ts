/**
 * cMeet auto-close worker.
 *
 * Point an external scheduler (glashdb.com) at
 *   GET https://<your-domain>/api/cron/cmeet-autoclose
 * on a short interval (every 5 minutes is a good default), sending
 *   Authorization: Bearer <CRON_SECRET>
 * if CRON_SECRET is configured.
 *
 * Ends any live meeting that's had no participant presence for 30 minutes.
 * The same sweep also runs lazily whenever a meeting or the meetings list is
 * read, so this cron is just the background safety net.
 */
import { NextRequest, NextResponse } from "next/server";
import { closeStaleCmeets, CMEET_IDLE_MINUTES } from "@/lib/cmeet-autoclose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (dev) - allow
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const closed = await closeStaleCmeets();
  return NextResponse.json({
    ok: true,
    idle_minutes: CMEET_IDLE_MINUTES,
    closed: closed.length,
    rooms: closed.map((row) => row.room_code),
  });
}
