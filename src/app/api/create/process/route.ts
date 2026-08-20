import { NextRequest, NextResponse } from "next/server";
import { runNextCreateJob } from "@/lib/create-platform/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Internal processor: drains queued CREATE jobs through the multi-brain engine
// layer (OpenAI / Magnific / Internal). Run on a short cron. Authenticated with
// the same shared secret as the external worker.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CREATE_WORKER_SECRET || process.env.CRON_SECRET || "";
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(token) && token === secret;
}

async function drain() {
  const MAX_PER_RUN = 5; // bound wall-clock per invocation
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < MAX_PER_RUN; i++) {
    const r = await runNextCreateJob();
    if (!r.processed) break;
    results.push(r);
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return drain();
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return drain();
}
