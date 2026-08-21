import { cookies } from "next/headers";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { getTeamSessionFromToken } from "@/lib/team-auth";
import { verifyAdminCookie } from "@/lib/admin-session-cookie";

export interface AdminSession {
  role: "super_admin" | "sub_admin";
  email: string;
  name: string;
  permissions: string[];
  source?: "admin_cookie" | "team_cookie";
  memberId?: string;
  teamRoleTitle?: string | null;
  department?: string | null;
  adminRoleName?: string | null;
}

/** Server-only: read the admin session from the httpOnly cookie or sub-admin team session. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const raw = store.get("admin_session")?.value;
  const parsed = verifyAdminCookie<AdminSession>(raw);
  if (parsed?.role === "super_admin") {
    return { ...parsed, source: parsed.source ?? "admin_cookie" };
  }
  if (parsed?.role === "sub_admin") {
    const activeAdmin = parsed.memberId
      ? await glashMaybeOne<{ id: string }>(
          `select id
             from public.team_members
            where id = $1
              and is_active = true
              and is_sub_admin = true
            limit 1`,
          [parsed.memberId],
        )
      : await glashMaybeOne<{ email: string }>(
          `select email
             from public.sub_admins
            where lower(email) = lower($1)
              and is_active = true
            limit 1`,
          [parsed.email],
        );
    if (activeAdmin) return { ...parsed, source: parsed.source ?? "admin_cookie" };
  }

  const teamToken = store.get("team_session")?.value;
  if (!teamToken) return null;

  const team = await getTeamSessionFromToken(teamToken);
  if (!team || !team.is_sub_admin) return null;

    let permissions: string[] = Array.isArray(team.permissions) ? [...team.permissions] : [];
    const teamRoleTitle: string | null = team.role_title ?? null;
    const department: string | null = team.department ?? null;
    let adminRoleName: string | null = null;
    // Single JOIN instead of two round-trips (role_id lookup, then admin_roles).
    try {
      const role = await glashMaybeOne<{ name: string | null; permissions: string[] | null }>(
        `select r.name, r.permissions
           from public.team_members m
           join public.admin_roles r on r.id = m.role_id
          where m.id = $1
          limit 1`,
        [team.id],
      );
      if (role) {
        adminRoleName = role.name ?? null;
        if (Array.isArray(role.permissions) && role.permissions.length) {
          permissions = Array.from(new Set([...role.permissions, ...permissions]));
        }
      }
    } catch {
      // Roles schema may not be present in older environments.
    }

  return {
    role: "sub_admin",
    email: team.email,
    name: team.full_name || team.username || "Team member",
    permissions,
    source: "team_cookie",
    memberId: team.id,
    teamRoleTitle,
    department,
    adminRoleName,
  };
}
