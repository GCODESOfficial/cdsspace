import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function can(session: AdminSession) {
  return session.role === "super_admin" || hasPermission(session.permissions, "applicants.screening");
}
async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) return { session: null, denied: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!can(session)) return { session, denied: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  return { session, denied: null as NextResponse | null };
}

/** GET ?role_id= → team members assigned to set questions for that role. */
export async function GET(req: NextRequest) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const roleId = req.nextUrl.searchParams.get("role_id");
  if (!roleId) return NextResponse.json({ ok: false, error: "Missing role_id" }, { status: 400 });

  const rows = await glashQuery(
    `select s.id, s.team_member_id, s.created_at,
            m.full_name, m.role_title, m.department, m.avatar_url
       from public.screening_role_setters s
       join public.team_members m on m.id = s.team_member_id
      where s.role_id = $1
      order by m.full_name asc`,
    [roleId],
  );
  return NextResponse.json({ ok: true, setters: rows });
}

/** POST { action: "assign", role_id, team_member_id } | { action: "remove", id } */
export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "assign");

  try {
    if (action === "assign") {
      const roleId = String(body?.role_id || "");
      const memberId = String(body?.team_member_id || "");
      if (!roleId || !memberId) return NextResponse.json({ ok: false, error: "Pick a role and a team member." }, { status: 400 });
      await glashQuery(
        `insert into public.screening_role_setters (role_id, team_member_id, assigned_by)
         values ($1, $2, $3)
         on conflict (role_id, team_member_id) do nothing`,
        [roleId, memberId, session?.name ?? session?.email ?? null],
      );
      await logActivity({ action: "screening.setter.assign", page: "screening", resource_type: "open_role", resource_id: roleId, resource_label: memberId });
      return NextResponse.json({ ok: true });
    }

    if (action === "remove") {
      const id = String(body?.id || "");
      if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
      await glashQuery(`delete from public.screening_role_setters where id = $1`, [id]);
      await logActivity({ action: "screening.setter.remove", page: "screening", resource_type: "screening_role_setter", resource_label: id });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Action failed" }, { status: 500 });
  }
}
