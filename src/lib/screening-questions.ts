import { glashQuery } from "@/lib/glashdb/postgres";
import { OBJECTIVE_QUESTION_COUNT } from "@/lib/screening-auth";

export interface IncomingQuestion {
  prompt?: string;
  options?: string[];
  correct_index?: number;
}

export interface RoleQuestion {
  id: string;
  position: number;
  prompt: string;
  options: string[];
  correct_index: number;
}

/** Full question bank for a role, WITH correct answers (admin / setter only). */
export async function getRoleQuestions(roleId: string): Promise<RoleQuestion[]> {
  return glashQuery<RoleQuestion>(
    `select id, position, prompt, options, correct_index
       from public.screening_questions
      where role_id = $1
      order by position asc`,
    [roleId],
  );
}

/**
 * Validate + replace a role's whole question bank. Shared by the admin
 * Question Bank route and the delegated team-member route so the rules stay
 * identical. Returns an error string instead of throwing for clean 400s.
 */
export async function replaceRoleQuestions(
  roleId: string,
  incoming: IncomingQuestion[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const cleaned: { prompt: string; options: string[]; correct_index: number }[] = [];

  for (const q of incoming) {
    const prompt = String(q?.prompt ?? "").trim();
    const options = Array.isArray(q?.options) ? q.options.map((o) => String(o ?? "").trim()) : [];
    const nonEmpty = options.filter(Boolean);
    if (!prompt && nonEmpty.length === 0) continue; // skip blank rows
    if (!prompt) return { ok: false, error: "Every question needs a prompt." };
    if (nonEmpty.length < 2) return { ok: false, error: `"${prompt.slice(0, 40)}" needs at least 2 options.` };
    if (nonEmpty.length > 6) return { ok: false, error: "A question can have at most 6 options." };
    const correct = Number(q?.correct_index);
    if (!Number.isInteger(correct) || correct < 0 || correct >= nonEmpty.length) {
      return { ok: false, error: `Pick a correct answer for "${prompt.slice(0, 40)}".` };
    }
    cleaned.push({ prompt, options: nonEmpty, correct_index: correct });
  }

  if (cleaned.length > OBJECTIVE_QUESTION_COUNT) {
    return { ok: false, error: `A role can have at most ${OBJECTIVE_QUESTION_COUNT} questions.` };
  }

  await glashQuery(`delete from public.screening_questions where role_id = $1`, [roleId]);
  for (let i = 0; i < cleaned.length; i++) {
    const q = cleaned[i];
    await glashQuery(
      `insert into public.screening_questions (role_id, position, prompt, options, correct_index)
       values ($1, $2, $3, $4, $5)`,
      [roleId, i + 1, q.prompt, q.options, q.correct_index],
    );
  }
  return { ok: true, count: cleaned.length };
}
