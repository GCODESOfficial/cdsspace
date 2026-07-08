import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { glashQuery } from "@/lib/glashdb/postgres";
import {
  SCREENING_COOKIE,
  getScreeningCandidate,
  logScreeningEvent,
  OBJECTIVE_MAX_WARNINGS,
} from "@/lib/screening-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  tab_blur: "left the test tab / switched to another window",
  visibility_hidden: "minimised or switched away from the test",
  fullscreen_exit: "exited full-screen mode",
  copy: "tried to copy the questions",
  contextmenu: "opened the right-click menu",
};

/**
 * Anti-cheat report. First offence → warning. Next offence → terminate:
 * the objective test is marked `terminated`, the application reverts to
 * `reviewing`, and the session is cleared (locking them out until an admin
 * re-shortlists). Body: { kind, detail?, question_position? }
 */
export async function POST(req: Request) {
  const c = await getScreeningCandidate();
  if (!c) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  if (c.objective_status !== "in_progress") {
    return NextResponse.json({ ok: true, terminated: c.objective_status === "terminated", warning: false });
  }

  const { kind, detail, question_position } = (await req.json().catch(() => ({}))) ?? {};
  const reason = REASONS[String(kind)] || `suspicious activity (${String(kind || "unknown")})`;
  const where = Number.isFinite(Number(question_position)) ? ` on question ${Number(question_position)}` : "";
  const fullReason = `Candidate ${reason}${where}.`;

  await logScreeningEvent(c.id, String(kind || "violation"), detail ? String(detail) : fullReason, question_position ?? null);

  // First offence(s) are warnings.
  if (c.warning_count < OBJECTIVE_MAX_WARNINGS) {
    const nextCount = c.warning_count + 1;
    await glashQuery(`update public.screening_candidates set warning_count = $1 where id = $2`, [nextCount, c.id]);
    await logScreeningEvent(c.id, "warning", fullReason, question_position ?? null);
    return NextResponse.json({
      ok: true,
      terminated: false,
      warning: true,
      warning_count: nextCount,
      max_warnings: OBJECTIVE_MAX_WARNINGS,
      message: "Warning: leaving the test again will end it immediately.",
    });
  }

  // Out of warnings → terminate and revert the application to "reviewing".
  await glashQuery(
    `update public.screening_candidates
        set objective_status = 'terminated',
            termination_reason = $1,
            session_token = null,
            session_expires_at = null
      where id = $2`,
    [fullReason, c.id],
  );
  await glashQuery(
    `update public.role_applications set status = 'reviewing' where id = $1 and status = 'shortlisted'`,
    [c.application_id],
  );
  await logScreeningEvent(c.id, "terminated", fullReason, question_position ?? null);

  const store = await cookies();
  const res = NextResponse.json({
    ok: true,
    terminated: true,
    warning: false,
    reason: fullReason,
  });
  if (store.get(SCREENING_COOKIE)) res.cookies.set(SCREENING_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
