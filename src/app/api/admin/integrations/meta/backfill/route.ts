import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMetaIntegration, type MetaPlatform } from "@/lib/meta/config";
import { runBackfillStep } from "@/lib/meta/backfill";

export const dynamic = "force-dynamic";
// Allow this route to run the full step budget on Vercel Pro/Enterprise.
export const maxDuration = 60;

// POST starts / resumes a backfill for a platform. Keeps running until the step budget is up,
// then returns so the admin UI can call again.
export async function POST(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { platform, months = 12, reset = false } = (await request.json()) as {
    platform: MetaPlatform;
    months?: number;
    reset?: boolean;
  };
  if (platform !== "facebook" && platform !== "instagram") {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const integ = await getMetaIntegration(platform);
  if (!integ) return NextResponse.json({ error: "Integration row missing" }, { status: 404 });
  if (!integ.page_access_token) {
    return NextResponse.json({ error: "Configure page_access_token first" }, { status: 409 });
  }

  const supabase = getSupabaseAdmin();

  // First call or reset → stamp start metadata.
  if (reset || integ.backfill_status === "idle" || integ.backfill_status === "done" || integ.backfill_status === "error") {
    const since = new Date(Date.now() - months * 30 * 24 * 3600 * 1000).toISOString();
    await supabase
      .from("meta_integrations")
      .update({
        backfill_status: "running",
        backfill_cursor: null,
        backfill_since: since,
        backfill_until: new Date().toISOString(),
        backfill_messages_ingested: 0,
        backfill_conversations_seen: 0,
        backfill_started_at: new Date().toISOString(),
        backfill_finished_at: null,
        backfill_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integ.id);
  }

  // Refresh with the patched state.
  const fresh = await getMetaIntegration(platform);
  if (!fresh) return NextResponse.json({ error: "Integration disappeared" }, { status: 500 });

  try {
    const result = await runBackfillStep(fresh);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("meta_integrations")
      .update({
        backfill_status: "error",
        backfill_last_error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integ.id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// GET current backfill status so the UI can poll progress.
export async function GET(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform") as MetaPlatform | null;
  if (platform !== "facebook" && platform !== "instagram") {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const integ = await getMetaIntegration(platform);
  if (!integ) return NextResponse.json({ error: "Missing" }, { status: 404 });

  return NextResponse.json({
    status: integ.backfill_status,
    cursor: integ.backfill_cursor,
    since: integ.backfill_since,
    until: integ.backfill_until,
    ingested: integ.backfill_messages_ingested,
    conversations: integ.backfill_conversations_seen,
    lastError: integ.backfill_last_error,
    startedAt: integ.backfill_started_at,
    finishedAt: integ.backfill_finished_at,
  });
}
