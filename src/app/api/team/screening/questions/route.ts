import { NextRequest, NextResponse } from "next/server";
import { getTeamSession } from "@/lib/team-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { OBJECTIVE_QUESTION_COUNT } from "@/lib/screening-auth";
import { getRoleQuestions, replaceRoleQuestions } from "@/lib/screening-questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Confirm the logged-in member is an assigned setter for the role. */
async function assertAssigned(memberId: string, roleId: string): Promise<boolean> {
  const row = await glashMaybeOne(
    `select 1 from public.screening_role_setters where team_member_id = $1 and role_id = $2 limit 1`,
    [memberId, roleId],
  );
  return !!row;
}

/** GET ?role_id= → the question bank for a role the member is assigned to. */
export async function GET(req: NextRequest) {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });

  const roleId = req.nextUrl.searchParams.get("role_id");
  if (!roleId) return NextResponse.json({ ok: false, error: "Missing role_id" }, { status: 400 });
  if (!(await assertAssigned(session.id, roleId))) {
    return NextResponse.json({ ok: false, error: "You're not assigned to this role." }, { status: 403 });
  }

  const rows = await getRoleQuestions(roleId);
  return NextResponse.json({ ok: true, questions: rows, expected_count: OBJECTIVE_QUESTION_COUNT });
}

/** POST { role_id, questions[] } → save, only if assigned to that role. */
export async function POST(req: NextRequest) {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const roleId = String(body?.role_id || "");
  if (!roleId) return NextResponse.json({ ok: false, error: "Missing role_id" }, { status: 400 });
  if (!(await assertAssigned(session.id, roleId))) {
    return NextResponse.json({ ok: false, error: "You're not assigned to this role." }, { status: 403 });
  }

  const incoming = Array.isArray(body?.questions) ? body.questions : [];
  const result = await replaceRoleQuestions(roleId, incoming);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
