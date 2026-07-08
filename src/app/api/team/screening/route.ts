import { NextResponse } from "next/server";
import { getTeamSession } from "@/lib/team-auth";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Roles the current team member is assigned to author screening questions for. */
export async function GET() {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });

  const roles = await glashQuery(
    `select r.id, r.title, r.role_type, r.is_active,
            (select count(*) from public.screening_questions q where q.role_id = r.id)::int as question_count
       from public.screening_role_setters s
       join public.open_roles r on r.id = s.role_id
      where s.team_member_id = $1
      order by r.role_type asc, r.title asc`,
    [session.id],
  );

  return NextResponse.json({ ok: true, roles });
}
