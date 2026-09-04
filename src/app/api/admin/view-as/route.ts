import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The people a super admin can preview the dashboard as: sub-admins, and team
 * members who have been granted admin access. Only the permission set is
 * returned, because previewing changes nothing but which navigation the super
 * admin's own browser draws.
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSessionAsync(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Previewing another person's access is a super admin tool only. A sub-admin
  // could otherwise read the full roster of who holds which permission.
  if (session.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [subAdmins, teamAdmins] = await Promise.all([
    glashQuery<any>(
      `select id, name, email, permissions, is_active
         from public.sub_admins
        order by name asc`,
    ).catch(() => []),
    glashQuery<any>(
      `select id, full_name, email, role_title, permissions, is_active
         from public.team_members
        where is_sub_admin = true
        order by full_name asc`,
    ).catch(() => []),
  ]);

  const people = [
    ...subAdmins
      .filter((row) => row.is_active !== false)
      .map((row) => ({
        id: `sub:${row.id}`,
        name: row.name || row.email || "Sub-admin",
        email: row.email || null,
        kind: "sub_admin" as const,
        roleTitle: null as string | null,
        permissions: Array.isArray(row.permissions) ? row.permissions : [],
      })),
    ...teamAdmins
      .filter((row) => row.is_active !== false)
      .map((row) => ({
        id: `team:${row.id}`,
        name: row.full_name || row.email || "Team member",
        email: row.email || null,
        kind: "team_member" as const,
        roleTitle: row.role_title || null,
        permissions: Array.isArray(row.permissions) ? row.permissions : [],
      })),
  ];

  return NextResponse.json({ people });
}
