import { NextResponse } from "next/server";
import { getScreeningCandidate, OBJECTIVE_QUESTION_COUNT } from "@/lib/screening-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dashboard payload for the logged-in candidate. */
export async function GET() {
  const c = await getScreeningCandidate();
  if (!c) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }

  // How many objective questions the admin has set for this role.
  const q = c.role_id
    ? await glashMaybeOne<{ count: string }>(
        `select count(*)::text as count from public.screening_questions where role_id = $1`,
        [c.role_id],
      )
    : null;
  const questionCount = q ? Number(q.count) : 0;

  // Per-role interview schedule (date/time + venue) set by an admin for the
  // whole role. Shown to every candidate screening for that role. Tolerate the
  // table not existing yet (migration applied by hand) - just show none.
  let roleInterview: { interview_at: string | null; venue: string | null; notes: string | null } | null = null;
  if (c.role_id) {
    try {
      roleInterview = await glashMaybeOne(
        `select interview_at, venue, notes from public.screening_role_interviews where role_id = $1`,
        [c.role_id],
      );
    } catch {
      roleInterview = null;
    }
  }

  const now = Date.now();
  const scheduledMs = c.scheduled_at ? new Date(c.scheduled_at).getTime() : null;
  // "On the day of the exam" - objective opens once the scheduled time arrives,
  // OR the moment an admin manually starts it (override regardless of schedule).
  const objectiveOpen = c.objective_unlocked || (scheduledMs != null && now >= scheduledMs);

  return NextResponse.json({
    ok: true,
    authenticated: true,
    now: new Date(now).toISOString(),
    candidate: {
      full_name: c.full_name,
      email: c.email,
      role_title: c.role_title,
      role_type: c.role_type,
      role_location: c.role_location,
      scheduled_at: c.scheduled_at,
      location: c.location,
      bring_items: c.bring_items,
      instructions: c.instructions,
      decision: c.decision,
      objective: {
        status: c.objective_status,
        score: c.objective_score,
        total: c.objective_total,
        termination_reason: c.termination_reason,
        question_count: questionCount,
        expected_count: OBJECTIVE_QUESTION_COUNT,
        open: objectiveOpen,
        available: objectiveOpen && questionCount > 0,
        submitted_at: c.objective_submitted_at,
      },
      practical: {
        status: c.practical_status,
        score: c.practical_score,
        feedback: c.practical_feedback,
      },
      interview: {
        status: c.interview_status,
        score: c.interview_score,
        feedback: c.interview_feedback,
        scheduled_at: roleInterview?.interview_at ?? null,
        venue: roleInterview?.venue ?? null,
        notes: roleInterview?.notes ?? null,
      },
    },
  });
}
