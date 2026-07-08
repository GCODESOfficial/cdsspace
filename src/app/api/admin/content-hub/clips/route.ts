/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import { requireContentHub } from "@/lib/content-hub/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

// GET - list recent AI video-repurposing jobs.
export async function GET() {
  const { deny } = await requireContentHub("content_hub.studio");
  if (deny) return deny;
  const jobs = await glashQuery<any>(
    `select * from public.content_clip_jobs order by created_at desc limit 50`,
  );
  return NextResponse.json({ ok: true, jobs });
}

// POST - queue a new clip job. The branded rendering pipeline runs out-of-band;
// this records the request and its parameters as the job's source of truth.
export async function POST(req: NextRequest) {
  const { session, deny } = await requireContentHub("content_hub.studio");
  if (deny) return deny;

  const body = await req.json().catch(() => ({}));
  const sourceUrl = str(body.source_url);
  if (!sourceUrl) return NextResponse.json({ ok: false, error: "Upload a video first." }, { status: 400 });

  const requested = Math.min(20, Math.max(1, Number(body.requested_clips) || 5));
  const clipTypes = Array.isArray(body.clip_types) ? body.clip_types.map(String) : [];

  const [job] = await glashQuery<any>(
    `insert into public.content_clip_jobs
       (content_id, source_url, requested_clips, clip_types, branding, status, note, created_by)
     values ($1,$2,$3,$4,$5,'queued',$6,$7)
     returning *`,
    [
      str(body.content_id) || null,
      sourceUrl,
      requested,
      clipTypes,
      body.branding && typeof body.branding === "object" ? body.branding : {},
      str(body.note) || null,
      session!.name,
    ],
  );

  await logActivity({
    action: "content_clip.queue",
    page: "content-hub",
    resource_type: "content_clip_job",
    resource_id: job.id,
    resource_label: `${requested} clips · ${clipTypes.join(", ") || "auto"}`,
    metadata: { requested, clipTypes },
  });

  return NextResponse.json({ ok: true, job });
}
