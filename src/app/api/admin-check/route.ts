import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export interface AdminSession {
  role: "super_admin" | "sub_admin";
  email: string;
  name: string;
  permissions: string[];
  source?: "admin_cookie" | "team_cookie";
}

/**
 * Synchronous cookie-only path — used by existing API routes that only care
 * about the admin-portal session cookie. Team-session bridging (for team
 * members with sub-admin access) requires the async variant below.
 */
export function getAdminSession(req: NextRequest): AdminSession | null {
  const cookie = req.cookies.get("admin_session");
  if (cookie?.value) {
    try {
      const session = JSON.parse(cookie.value) as AdminSession;
      if (session.role && session.email) return { ...session, source: "admin_cookie" };
    } catch {
      // fall through to legacy-string branch
    }
    if (cookie.value === "authenticated") {
      return {
        role: "super_admin",
        email: "ceo@cdsspace.pro",
        name: "Admin",
        permissions: ["all"],
        source: "admin_cookie",
      };
    }
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
const TEAM_CORE_COLUMNS =
  "id, full_name, email, username, is_sub_admin, is_active, permissions, session_expires_at";

/**
 * Async resolver. Prefers the admin cookie; falls back to the team-portal
 * session if that team member is marked `is_sub_admin`. That lets a sub-admin
 * flipping from the Team Portal into the Admin Portal stay logged in with
 * their team credentials — no second password prompt.
 *
 * If the team member has a `role_id` (and the `admin_roles` table exists),
 * the role's permission list is merged on top of the member's own
 * `permissions` array so role changes take effect without touching each
 * member. Any schema gap (missing column or missing table) is swallowed —
 * the bridge always returns a valid session as long as the core columns
 * resolve.
 */
export async function getAdminSessionAsync(req: NextRequest): Promise<AdminSession | null> {
  const fromAdminCookie = getAdminSession(req);
  if (fromAdminCookie) return fromAdminCookie;

  const teamToken = req.cookies.get("team_session")?.value;
  if (!teamToken || !supabaseAdmin) return null;

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_members")
    .select(TEAM_CORE_COLUMNS)
    .eq("session_token", teamToken)
    .maybeSingle();

  if (error || !data) return null;
  if (!data.is_active || !data.is_sub_admin) return null;
  if (data.session_expires_at && new Date(data.session_expires_at) < new Date()) return null;

  let permissions: string[] = Array.isArray(data.permissions) ? [...data.permissions] : [];

  // Try to layer role permissions on top, but NEVER let a missing column or
  // table break the sign-in bridge. If the roles schema isn't deployed yet
  // we just return the member's own permissions array.
  try {
    const { data: withRole } = await db
      .from("team_members")
      .select("role_id")
      .eq("id", data.id)
      .maybeSingle();
    const roleId = (withRole as { role_id: string | null } | null)?.role_id;
    if (roleId) {
      const { data: role } = await db
        .from("admin_roles")
        .select("permissions")
        .eq("id", roleId)
        .maybeSingle();
      const rolePerms = (role as { permissions: string[] | null } | null)?.permissions;
      if (rolePerms && rolePerms.length) {
        permissions = Array.from(new Set([...(rolePerms as string[]), ...permissions]));
      }
    }
  } catch {
    // Roles schema not deployed yet — fall back to member-only permissions.
  }

  return {
    role: "sub_admin",
    email: data.email,
    name: data.full_name || data.username || "Team member",
    permissions,
    source: "team_cookie",
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
    });
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
