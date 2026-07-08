import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function can(session: AdminSession, key: string) {
  return session.role === "super_admin" || hasPermission(session.permissions, key);
}

/** Objective answer breakdown + activity/anti-cheat log for one candidate. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!can(session, "applicants.screening")) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const answers = await glashQuery(
    `select q.position, q.prompt, q.options, q.correct_index,
            a.selected_index, a.is_correct
       from public.screening_candidates c
       join public.screening_questions q on q.role_id = c.role_id
       left join public.screening_answers a on a.candidate_id = c.id and a.question_id = q.id
      where c.id = $1
      order by q.position asc`,
    [id],
  );

  const events = await glashQuery(
    `select kind, detail, question_position, created_at
       from public.screening_events
      where candidate_id = $1
      order by created_at asc`,
    [id],
  );

  return NextResponse.json({ ok: true, answers, events });
}
