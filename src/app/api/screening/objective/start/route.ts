import { NextResponse } from "next/server";
import { glashQuery } from "@/lib/glashdb/postgres";
import {
  getScreeningCandidate,
  logScreeningEvent,
  OBJECTIVE_PER_QUESTION_SECONDS,
  OBJECTIVE_TOTAL_MINUTES,
  OBJECTIVE_MAX_WARNINGS,
} from "@/lib/screening-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QuestionRow {
  id: string;
  position: number;
  prompt: string;
  options: string[];
}

/**
 * Begin (or resume) the objective test.
 * Returns the questions WITHOUT correct answers, the hard deadline, and any
 * answers already recorded (so a reload mid-test resumes in place).
 */
export async function POST() {
  const c = await getScreeningCandidate();
  if (!c) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });

  if (c.objective_status === "submitted") {
    return NextResponse.json({ ok: false, error: "You have already completed the objective test." }, { status: 409 });
  }
  if (c.objective_status === "terminated") {
    return NextResponse.json({ ok: false, error: "Your objective test was terminated." }, { status: 409 });
  }

  // Must be on/after the scheduled time, unless an admin manually started it.
  const scheduledMs = c.scheduled_at ? new Date(c.scheduled_at).getTime() : null;
  const open = c.objective_unlocked || (scheduledMs != null && Date.now() >= scheduledMs);
  if (!open) {
    return NextResponse.json({ ok: false, error: "The objective test is not open yet." }, { status: 403 });
  }

  if (!c.role_id) {
    return NextResponse.json({ ok: false, error: "No role is attached to your application." }, { status: 400 });
  }

  const questions = await glashQuery<QuestionRow>(
    `select id, position, prompt, options
       from public.screening_questions
      where role_id = $1
      order by position asc`,
    [c.role_id],
  );
  if (questions.length === 0) {
    return NextResponse.json({ ok: false, error: "Your objective test has not been set up yet." }, { status: 409 });
  }

  let deadline = c.objective_deadline;
  if (c.objective_status === "not_started") {
    const startedAt = new Date();
    deadline = new Date(startedAt.getTime() + OBJECTIVE_TOTAL_MINUTES * 60 * 1000).toISOString();
    await glashQuery(
      `update public.screening_candidates
          set objective_status = 'in_progress',
              objective_started_at = $1,
              objective_deadline = $2,
              warning_count = 0
        where id = $3`,
      [startedAt.toISOString(), deadline, c.id],
    );
    await logScreeningEvent(c.id, "started", `Objective test started (${questions.length} questions)`);
  }

  // If a resumed test is already past its deadline, the client should submit
  // immediately; surface that via remaining time = 0.
  const remainingMs = deadline ? new Date(deadline).getTime() - Date.now() : 0;

  // Answers already given (resume support).
  const prior = await glashQuery<{ question_id: string; selected_index: number | null }>(
    `select question_id, selected_index from public.screening_answers where candidate_id = $1`,
    [c.id],
  );
  const answered: Record<string, number | null> = {};
  for (const a of prior) answered[a.question_id] = a.selected_index;

  return NextResponse.json({
    ok: true,
    deadline,
    server_now: new Date().toISOString(),
    remaining_ms: Math.max(0, remainingMs),
    per_question_seconds: OBJECTIVE_PER_QUESTION_SECONDS,
    total_minutes: OBJECTIVE_TOTAL_MINUTES,
    max_warnings: OBJECTIVE_MAX_WARNINGS,
    warning_count: c.warning_count,
    answered,
    questions: questions.map((q) => ({
      id: q.id,
      position: q.position,
      prompt: q.prompt,
      options: q.options,
    })),
  });
}
