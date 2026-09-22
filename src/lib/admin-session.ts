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
  issuedAt?: string;
}

async function refreshCookieSubAdmin(session: AdminSession): Promise<AdminSession | null> {
  const identifier = session.memberId || session.email;
  const predicate = session.memberId ? "m.id = $1::uuid" : "lower(m.email) = lower($1)";
  try {
    const member = await glashMaybeOne<{
      id: string;
      full_name: string | null;
      email: string;
      role_title: string | null;
      department: string | null;
      permissions: string[] | null;
      admin_role_name: string | null;
      role_permissions: string[] | null;
    }>(
      `select m.id, m.full_name, m.email, m.role_title, m.department, m.permissions,
              r.name as admin_role_name, r.permissions as role_permissions
         from public.team_members m
         left join public.admin_roles r on r.id = m.role_id
        where ${predicate}
          and m.is_active = true
          and m.is_sub_admin = true
        limit 1`,
      [identifier],
    );
    if (member) {
      return {
        role: "sub_admin",
        email: member.email,
        name: member.full_name || session.name || member.email,
        permissions: Array.from(new Set([
          ...(Array.isArray(member.permissions) ? member.permissions : []),
          ...(Array.isArray(member.role_permissions) ? member.role_permissions : []),
        ])),
        source: "admin_cookie",
        memberId: member.id,
        teamRoleTitle: member.role_title,
        department: member.department,
        adminRoleName: member.admin_role_name,
      };
    }
  } catch {
    // Compatibility fallback for databases that predate roles/role_id.
  }

  const legacy = await glashMaybeOne<{ email: string; name: string | null; permissions: string[] | null }>(
    `select email, name, permissions
       from public.sub_admins
      where lower(email) = lower($1)
        and is_active = true
      limit 1`,
    [session.email],
  ).catch(() => null);
  if (!legacy) return null;
  return {
    ...session,
    email: legacy.email,
    name: legacy.name || session.name,
    permissions: Array.isArray(legacy.permissions) ? legacy.permissions : [],
    source: "admin_cookie",
  };
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
    const refreshed = await refreshCookieSubAdmin(parsed);
    if (refreshed) return refreshed;
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
