import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lets an admin staff member sign in and clock in from anywhere, outside the
 * office geofence. Only a super admin may grant or withdraw it, and only for
 * team members who hold admin access.
 * Body: { enabled: boolean }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSessionAsync(req);
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "super_admin") {
    return NextResponse.json({ ok: false, error: "Only a super admin can change where an admin may work from." }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Team member is invalid." }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "Say whether access from anywhere is on or off." }, { status: 400 });
  }

  const member = await glashMaybeOne<{ id: string; full_name: string; access_anywhere: boolean }>(
    `update public.team_members
        set access_anywhere = $2,
            access_anywhere_set_by = $3,
            access_anywhere_set_at = now()
      where id = $1 and is_sub_admin = true
      returning id, full_name, access_anywhere`,
    [id, body.enabled, session.name || session.email],
  );
  if (!member) return NextResponse.json({ ok: false, error: "Admin team member not found." }, { status: 404 });

  await logActivity({
    action: member.access_anywhere ? "team_member.access_anywhere_on" : "team_member.access_anywhere_off",
    page: "sub-admins",
    resource_type: "team_member",
    resource_id: member.id,
    resource_label: member.full_name,
    metadata: { access_anywhere: member.access_anywhere },
  });

  return NextResponse.json({ ok: true, member });
}
