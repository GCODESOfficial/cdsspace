import { NextResponse } from "next/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getScreeningCandidate, logScreeningEvent } from "@/lib/screening-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Record a single answer. Correctness is computed server-side from the
 * question bank - the correct index never leaves the server.
 * Body: { question_id, selected_index | null }
 */
export async function POST(req: Request) {
  const c = await getScreeningCandidate();
  if (!c) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  if (c.objective_status !== "in_progress") {
    return NextResponse.json({ ok: false, error: "The test is not in progress." }, { status: 409 });
  }
  // Past the deadline - refuse to record further answers.
  if (c.objective_deadline && Date.now() > new Date(c.objective_deadline).getTime()) {
    return NextResponse.json({ ok: false, error: "Time is up.", expired: true }, { status: 409 });
  }

  const { question_id, selected_index } = (await req.json().catch(() => ({}))) ?? {};
  if (!question_id) {
    return NextResponse.json({ ok: false, error: "Missing question." }, { status: 400 });
  }

  const q = await glashMaybeOne<{ correct_index: number; options: string[]; position: number }>(
    `select correct_index, options, position
       from public.screening_questions
      where id = $1 and role_id = $2
      limit 1`,
    [question_id, c.role_id],
  );
  if (!q) return NextResponse.json({ ok: false, error: "Unknown question." }, { status: 400 });

  let selected: number | null = null;
  if (selected_index !== null && selected_index !== undefined) {
    const idx = Number(selected_index);
    if (Number.isInteger(idx) && idx >= 0 && idx < q.options.length) selected = idx;
  }
  const isCorrect = selected !== null && selected === q.correct_index;

  await glashQuery(
    `insert into public.screening_answers (candidate_id, question_id, selected_index, is_correct)
     values ($1, $2, $3, $4)
     on conflict (candidate_id, question_id)
     do update set selected_index = excluded.selected_index,
                   is_correct = excluded.is_correct,
                   answered_at = now()`,
    [c.id, question_id, selected, isCorrect],
  );
  await logScreeningEvent(c.id, "answered", null, q.position);

  return NextResponse.json({ ok: true });
}
