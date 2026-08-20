import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
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
  if (fromAdminCookie) return fromAdminCookie;

  const teamToken = req.cookies.get("team_session")?.value;
  if (!teamToken || !supabaseAdmin) return null;

  const db = supabaseAdmin as any;
  const team = await getTeamSessionFromToken(teamToken);
  if (!team || !team.is_sub_admin) return null;

  let permissions: string[] = Array.isArray(team.permissions) ? [...team.permissions] : [];
  let teamRoleTitle: string | null = null;
  let department: string | null = null;
  let adminRoleName: string | null = null;

  // One read for role_title + department + role_id (was two separate queries).
  let roleId: string | null = null;
  try {
    const { data: profile } = await db
      .from("team_members")
      .select("role_title, department, role_id")
      .eq("id", team.id)
      .maybeSingle();
    const p = profile as { role_title: string | null; department: string | null; role_id: string | null } | null;
    teamRoleTitle = p?.role_title ?? null;
    department = p?.department ?? null;
    roleId = p?.role_id ?? null;
  } catch {
    // Older schemas still get a valid sub-admin session.
  }

  // Try to layer role permissions on top, but NEVER let a missing column or
  // table break the sign-in bridge. If the roles schema isn't deployed yet
  // we just return the member's own permissions array.
  try {
    if (roleId) {
      const { data: role } = await db
        .from("admin_roles")
        .select("name, permissions")
        .eq("id", roleId)
        .maybeSingle();
      adminRoleName = (role as { name: string | null; permissions: string[] | null } | null)?.name ?? null;
      const rolePerms = (role as { name: string | null; permissions: string[] | null } | null)?.permissions;
      if (rolePerms && rolePerms.length) {
        permissions = Array.from(new Set([...(rolePerms as string[]), ...permissions]));
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
  const session = await getAdminSessionAsync(req);

  if (session) {
    return NextResponse.json({
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
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
