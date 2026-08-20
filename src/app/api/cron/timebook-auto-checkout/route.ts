/**
 * Team Timebook auto-checkout worker.
 *
 * Point an external scheduler at:
 *   GET https://<your-domain>/api/cron/timebook-auto-checkout
 * around/after 23:55 Africa/Lagos, sending:
 *   Authorization: Bearer <CRON_SECRET>
 * if CRON_SECRET is configured.
 *
 * The 18:15 time remains the regular safety cutoff used for forgotten daytime
 * sessions. Finalisation waits until 23:55 so a member can still check out
 * manually during the evening. Forgotten night sessions close at 23:55.
 */
import { NextRequest, NextResponse } from "next/server";
import { autoCheckoutOpenTimeEntries } from "@/lib/timebook-auto-checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await autoCheckoutOpenTimeEntries({ source: "timebook_auto_checkout_cron" });
    return NextResponse.json({
      ok: true,
      due: result.due,
      work_date: result.workDate,
      cutoff_at: result.cutoffAt,
      closed: result.closed.length,
      entries: result.closed,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Auto-checkout failed." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
