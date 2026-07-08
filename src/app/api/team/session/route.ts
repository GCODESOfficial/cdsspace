import { NextResponse } from "next/server";
import { getTeamSession } from "@/lib/team-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";

export async function GET() {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });

  // Surface whether this member is assigned to author screening questions, so
  // the Team Portal shows the "Screening Questions" link only to assigned members.
  const assigned = await glashMaybeOne(
    `select 1 from public.screening_role_setters where team_member_id = $1 limit 1`,
    [session.id],
  ).catch(() => null);

  return NextResponse.json({
    ok: true,
    authenticated: true,
    member: { ...session, has_screening_assignment: !!assigned },
  });
}
