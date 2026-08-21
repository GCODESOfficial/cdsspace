import { NextRequest, NextResponse } from "next/server";
import { getTeamSessionFromToken } from "@/lib/team-auth";
import { adminSessionCookieOptions, signAdminCookie, verifyAdminCookie } from "@/lib/admin-session-cookie";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

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

/**
 * Synchronous cookie-only path - used by existing API routes that only care
 * about the admin-portal session cookie. Team-session bridging (for team
 * members with sub-admin access) requires the async variant below.
 */
export function getAdminSession(req: NextRequest): AdminSession | null {
  const session = verifyAdminCookie<AdminSession>(req.cookies.get("admin_session")?.value);
  if (session && session.role && session.email) {
    return { ...session, source: "admin_cookie" };
  }
  return null;
}

/**
 * Core team_members columns that exist on every environment. The `role_id`
 * column was added by migration 20260423_admin_roles.sql; production
 * databases that haven't run the migration yet would blow up on a plain
 * SELECT including `role_id`, taking down the entire sub-admin bridge and
 * bouncing users back to the admin login. We query the safe subset first
 * and opportunistically layer on the role later.
 */
/**
 * Async resolver. Prefers the admin cookie; falls back to the team-portal
 * session if that team member is marked `is_sub_admin`. That lets a sub-admin
 * flipping from the Team Portal into the Admin Portal stay logged in with
 * their team credentials - no second password prompt.
 *
 * If the team member has a `role_id` (and the `admin_roles` table exists),
 * the role's permission list is merged on top of the member's own
 * `permissions` array so role changes take effect without touching each
 * member. Any schema gap (missing column or missing table) is swallowed -
 * the bridge always returns a valid session as long as the core columns
 * resolve.
 */
export async function getAdminSessionAsync(req: NextRequest): Promise<AdminSession | null> {
  const fromAdminCookie = getAdminSession(req);
  if (fromAdminCookie?.role === "super_admin") return fromAdminCookie;
  if (fromAdminCookie?.role === "sub_admin") {
    const activeAdmin = fromAdminCookie.memberId
      ? await glashMaybeOne<{ id: string }>(
          `select id
             from public.team_members
            where id = $1
              and is_active = true
              and is_sub_admin = true
            limit 1`,
          [fromAdminCookie.memberId],
        )
      : await glashMaybeOne<{ email: string }>(
          `select email
             from public.sub_admins
            where lower(email) = lower($1)
              and is_active = true
            limit 1`,
          [fromAdminCookie.email],
        );
    return activeAdmin ? fromAdminCookie : null;
  }

  const teamToken = req.cookies.get("team_session")?.value;
  if (!teamToken) return null;

  const team = await getTeamSessionFromToken(teamToken);
  if (!team || !team.is_sub_admin) return null;

  let permissions: string[] = Array.isArray(team.permissions) ? [...team.permissions] : [];
  let teamRoleTitle: string | null = null;
  let department: string | null = null;
  let adminRoleName: string | null = null;

  teamRoleTitle = team.role_title ?? null;
  department = team.department ?? null;

  // Try to layer role permissions on top, but NEVER let a missing column or
  // table break the sign-in bridge. If the roles schema isn't deployed yet
  // we just return the member's own permissions array.
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
      const rolePerms = role.permissions;
      if (rolePerms && rolePerms.length) {
        permissions = Array.from(new Set([...rolePerms, ...permissions]));
      }
    }
  } catch {
    // Roles schema not deployed yet - fall back to member-only permissions.
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

export async function GET(req: NextRequest) {
  let session: AdminSession | null;
  try {
    session = await getAdminSessionAsync(req);
  } catch {
    return NextResponse.json(
      { authenticated: false, temporarilyUnavailable: true },
      { status: 503 },
    );
  }

  if (session) {
    const response = NextResponse.json({
      authenticated: true,
      role: session.role,
      name: session.name,
      email: session.email,
      permissions: session.permissions,
      source: session.source,
      memberId: session.memberId,
      teamRoleTitle: session.teamRoleTitle,
      department: session.department,
      adminRoleName: session.adminRoleName,
    });

    // A verified team sub-admin is also given the signed admin cookie used by
    // older admin endpoints. This is a first-party session handoff, not a
    // second login, and remains tied to the same stable team-member ID.
    if (session.source === "team_cookie") {
      response.cookies.set("admin_session", signAdminCookie({
        role: session.role,
        email: session.email,
        name: session.name,
        permissions: session.permissions,
        memberId: session.memberId,
        teamRoleTitle: session.teamRoleTitle,
        department: session.department,
        adminRoleName: session.adminRoleName,
      }), adminSessionCookieOptions());
    }

    return response;
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
