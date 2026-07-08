import { NextResponse } from "next/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getScreeningCandidate, logScreeningEvent } from "@/lib/screening-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Finalise the objective test. Scores from the recorded answers (correctness
 * was already computed server-side at answer time) and marks it submitted.
 * Safe to call after the deadline - that's how a timed-out test is closed.
 */
export async function POST() {
  const c = await getScreeningCandidate();
  if (!c) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });

  if (c.objective_status === "submitted") {
    return NextResponse.json({ ok: true, already: true, score: c.objective_score, total: c.objective_total });
  }
  if (c.objective_status !== "in_progress") {
    return NextResponse.json({ ok: false, error: "The test is not in progress." }, { status: 409 });
  }

  const total = await glashMaybeOne<{ count: string }>(
    `select count(*)::text as count from public.screening_questions where role_id = $1`,
    [c.role_id],
  );
  const correct = await glashMaybeOne<{ count: string }>(
    `select count(*)::text as count from public.screening_answers where candidate_id = $1 and is_correct = true`,
    [c.id],
  );
  const totalCount = total ? Number(total.count) : 0;
  const score = correct ? Number(correct.count) : 0;

  await glashQuery(
    `update public.screening_candidates
        set objective_status = 'submitted',
            objective_score = $1,
            objective_total = $2,
            objective_submitted_at = now()
      where id = $3`,
    [score, totalCount, c.id],
  );
  await logScreeningEvent(c.id, "submitted", `Scored ${score}/${totalCount}`);

  return NextResponse.json({ ok: true, score, total: totalCount });
}
