import { NextRequest, NextResponse } from "next/server";
import { claimNextCreateJob, completeCreateJob, failCreateJob } from "@/lib/create-platform/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The CREATE worker pool authenticates with a shared bearer secret. A dedicated
// CREATE_WORKER_SECRET is preferred; it falls back to CRON_SECRET so existing
// infra keeps working.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CREATE_WORKER_SECRET || process.env.CRON_SECRET || "";
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(token) && token === secret;
}

function str(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = str(body.action, 20);

  try {
    if (action === "claim") {
      const workerId = str(body.workerId, 120) || "worker";
      const toolSlugs = Array.isArray(body.toolSlugs)
        ? body.toolSlugs.map((s) => str(s, 80)).filter(Boolean).slice(0, 20)
        : undefined;
      const job = await claimNextCreateJob(workerId, toolSlugs);
      return NextResponse.json({ ok: true, job });
    }

    if (action === "complete") {
      const jobId = str(body.jobId, 80);
      if (!jobId) return NextResponse.json({ error: "Missing jobId." }, { status: 400 });
      const output = body.output && typeof body.output === "object" && !Array.isArray(body.output)
        ? body.output as Record<string, unknown>
        : null;
      if (!output) return NextResponse.json({ error: "Missing output." }, { status: 400 });
      const done = await completeCreateJob(jobId, {
        output,
        fileName: str(body.fileName, 200) || null,
        fileSizeBytes: typeof body.fileSizeBytes === "number" ? body.fileSizeBytes : null,
        outputFormat: str(body.outputFormat, 20) || null,
        title: str(body.title, 140) || null,
      });
      return NextResponse.json({ ok: done });
    }

    if (action === "fail") {
      const jobId = str(body.jobId, 80);
      if (!jobId) return NextResponse.json({ error: "Missing jobId." }, { status: 400 });
      const done = await failCreateJob(jobId, str(body.error, 500) || "Processing failed.");
      return NextResponse.json({ ok: done });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("[create/worker] error:", error);
    return NextResponse.json({ error: "Worker request failed." }, { status: 500 });
  }
}
