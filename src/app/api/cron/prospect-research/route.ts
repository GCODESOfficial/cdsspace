import { NextRequest, NextResponse } from "next/server";
import { activeResearchRun, advanceResearchRun } from "@/lib/prospect-research-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Advances an active prospect research run.
 *
 * The admin page no longer drives research, so this keeps it moving even when
 * nobody is signed in. Ordinary admin traffic does the same thing, so a
 * missed schedule only slows the work rather than stopping it.
 */
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const batches = Number(new URL(req.url).searchParams.get("batches") || 2);
  const result = await advanceResearchRun({ batches: Number.isFinite(batches) ? batches : 2, budgetMs: 60_000 });
  return NextResponse.json({ ok: true, ...result, run: await activeResearchRun() });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
