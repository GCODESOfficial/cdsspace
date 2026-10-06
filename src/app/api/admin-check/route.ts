import { NextRequest, NextResponse } from "next/server";
import { getTeamSessionFromToken } from "@/lib/team-auth";
import { adminSessionCookieOptions, signAdminCookie, verifyAdminCookie } from "@/lib/admin-session-cookie";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { sweepResearchIfDue } from "@/lib/prospect-research-runner";

/**
 * A schema problem is permanent and means what it says; anything else - a
 * timeout, a dropped connection, a busy database - is a passing condition that
 * must never be reported as "you are not an admin" or as a dead end.
 */
function isTransientDatabaseError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code || "");
  const permanent = ["42P01", "42703", "42883", "42P02", "22P02"];
  return !permanent.includes(code);
}

const RESOLVE_ATTEMPTS = 3;

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

async function refreshSubAdminSession(session: AdminSession): Promise<AdminSession | null> {
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
  } catch (error) {
    // Compatibility fallback for databases that predate roles/role_id. A real
    // database failure is different: the cookie is still valid, so keep the
    // admin signed in on the permissions it already carries rather than
    // treating a transient outage as "this person is not an admin".
    if (isTransientDatabaseError(error)) return { ...session, source: "admin_cookie" };
  }

  // Old admin sessions may predate stable team-member IDs. Keep their
  // normalized-email compatibility path, but refresh permissions from the
  // database instead of trusting the stale cookie payload.
  let legacyFailed = false;
  const legacy = await glashMaybeOne<{
    email: string;
    name: string | null;
    permissions: string[] | null;
  }>(
    `select email, name, permissions
       from public.sub_admins
      where lower(email) = lower($1)
        and is_active = true
      limit 1`,
    [session.email],
  ).catch((error) => {
    legacyFailed = isTransientDatabaseError(error);
    return null;
  });
  if (legacyFailed) return { ...session, source: "admin_cookie" };
  if (!legacy) return null;
  return {
    ...session,
    email: legacy.email,
    name: legacy.name || session.name,
    permissions: Array.isArray(legacy.permissions) ? legacy.permissions : [],
    source: "admin_cookie",
  };
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
    return refreshSubAdminSession(fromAdminCookie);
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
  // An admin is using the platform, so this is a good moment to move any
  // background research along.
  void sweepResearchIfDue();
  let session: AdminSession | null = null;
  let lastError: unknown = null;

  // The portal handoff used to fail outright on a single database hiccup,
  // stranding a signed-in admin on "temporarily unavailable" until they
  // happened to retry at a better moment. Try a few times first.
  for (let attempt = 0; attempt < RESOLVE_ATTEMPTS; attempt += 1) {
    try {
      session = await getAdminSessionAsync(req);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === RESOLVE_ATTEMPTS - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }

  // Last resort: the signed admin cookie is itself proof of a live session,
  // so honour it rather than locking someone out of a portal they are signed
  // in to. Permissions may be a few minutes stale until the database answers.
  if (!session && lastError) {
    const cookieOnly = getAdminSession(req);
    if (cookieOnly) {
      session = cookieOnly;
      lastError = null;
    }
  }

  if (!session && lastError) {
    return NextResponse.json(
      { authenticated: false, temporarilyUnavailable: true },
      { status: 503, headers: { "Retry-After": "2" } },
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
        issuedAt: new Date().toISOString(),
      }), adminSessionCookieOptions());
    }

    return response;
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
