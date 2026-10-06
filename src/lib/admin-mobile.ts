import "server-only";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { insertActivityLog } from "@/lib/activity-log";
import { signAdminCookie } from "@/lib/admin-session-cookie";
import { glashMaybeOne, glashOne, glashQuery } from "@/lib/glashdb/postgres";
import { generateSalt, hashPassword, type TeamSession } from "@/lib/team-auth";
import { adminBearerToken, ADMIN_MOBILE_SESSION_SECONDS } from "@/lib/admin-mobile-session-core.mjs";

/**
 * Admin portal sign-in shared by the web (/api/admin-login, cookie) and the
 * mobile app (/api/mobile/v1/admin/*, Bearer token). Both issue the same signed
 * admin_session claim set; the app receives it as "cdsa1.<value>".
 */

export const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "ceo@cdsspace.pro";
const SUPER_ADMIN_USERNAME = "superadmin";
// Never hardcode the secret in source. Set ADMIN_PASSWORD in the environment.
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AdminClaims {
  role: "super_admin" | "sub_admin";
  email: string;
  name: string;
  permissions: string[];
  memberId?: string;
  teamRoleTitle?: string | null;
  department?: string | null;
  adminRoleName?: string | null;
  source?: "admin_cookie" | "team_cookie";
  issuedAt?: string;
}

type LoginResult = { ok: true; claims: AdminClaims } | { ok: false; error: string; status: number };

/**
 * Checks admin credentials exactly like the web login: the super admin from the
 * environment, otherwise an active sub_admins row (bcrypt, with the legacy
 * plaintext upgrade). Records the login in the activity log.
 */
export async function authenticateAdminLogin(
  email: string,
  password: string,
  meta: { userAgent: string | null; ipAddress: string | null; source: string },
): Promise<LoginResult> {
  const metadata = { source: meta.source, user_agent: meta.userAgent, ip_address: meta.ipAddress };

  // Require a configured password so a missing ADMIN_PASSWORD can never
  // authenticate an empty/blank password.
  if (SUPER_ADMIN_PASSWORD && email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD) {
    void insertActivityLog({
      actor_kind: "admin",
      actor_id: SUPER_ADMIN_EMAIL,
      actor_name: "Admin",
      actor_is_admin: true,
      action: "admin.login",
      page: "login",
      resource_type: "admin_session",
      resource_label: "Super admin login",
      metadata,
    }).catch((err) => console.error("[audit] admin login log failed:", err));
    return {
      ok: true,
      claims: { role: "super_admin", email: SUPER_ADMIN_EMAIL, name: "Admin", permissions: ["all"], issuedAt: new Date().toISOString() },
    };
  }

  // Look up by email only, then verify the password in code - never send the
  // plaintext password to the DB as a filter.
  const { data: subAdmin, error } = await supabase
    .from("sub_admins")
    .select("*")
    .eq("email", email)
    .eq("is_active", true)
    .single();

  const stored: string = subAdmin?.password || "";
  const isBcrypt = /^\$2[aby]\$/.test(stored);
  let passwordOk = false;
  if (!error && subAdmin && stored) {
    if (isBcrypt) {
      passwordOk = await bcrypt.compare(password, stored);
    } else {
      // Legacy plaintext row: verify, then transparently upgrade to a hash.
      passwordOk = password === stored;
      if (passwordOk) {
        try {
          const hash = await bcrypt.hash(password, 10);
          await supabase.from("sub_admins").update({ password: hash }).eq("email", subAdmin.email);
        } catch (err) {
          console.error("[auth] sub-admin password hash upgrade failed:", err);
        }
      }
    }
  }

  if (!passwordOk || !subAdmin) return { ok: false, error: "Invalid credentials", status: 401 };

  const linkedTeamMember = await glashMaybeOne<{ id: string }>(
    `select id
       from public.team_members
      where lower(email) = lower($1)
        and is_active = true
        and is_sub_admin = true
      order by created_at asc
      limit 1`,
    [subAdmin.email],
  ).catch(() => null);

  void insertActivityLog({
    actor_kind: "admin",
    actor_id: subAdmin.email,
    actor_name: subAdmin.name || subAdmin.email,
    actor_is_admin: true,
    action: "admin.login",
    page: "login",
    resource_type: "admin_session",
    resource_label: "Sub-admin login",
    metadata: { ...metadata, role: "sub_admin" },
  }).catch((err) => console.error("[audit] sub-admin login log failed:", err));

  return {
    ok: true,
    claims: {
      role: "sub_admin",
      email: subAdmin.email,
      name: subAdmin.name,
      permissions: subAdmin.permissions || [],
      memberId: linkedTeamMember?.id,
      issuedAt: new Date().toISOString(),
    },
  };
}

/** The admin claims a sub-admin team member carries (same as /api/admin-check's team bridge). */
export async function adminClaimsForTeamMember(team: TeamSession): Promise<AdminClaims | null> {
  if (!team?.is_sub_admin) return null;
  let permissions: string[] = Array.isArray(team.permissions) ? [...team.permissions] : [];
  let adminRoleName: string | null = null;
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
    // Roles schema not deployed yet - fall back to member-only permissions.
  }
  const superAdmin = String(team.email || "").toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
  return {
    role: superAdmin ? "super_admin" : "sub_admin",
    email: team.email,
    name: superAdmin ? "Admin" : team.full_name || team.username || "Team member",
    permissions: superAdmin ? ["all"] : permissions,
    memberId: team.id,
    teamRoleTitle: team.role_title ?? null,
    department: team.department ?? null,
    adminRoleName,
    source: "team_cookie",
    issuedAt: new Date().toISOString(),
  };
}

/** Bearer token + expiry for the app. */
export function issueAdminMobileToken(claims: AdminClaims) {
  const issuedAt = claims.issuedAt || new Date().toISOString();
  const token = adminBearerToken(signAdminCookie({ ...claims, issuedAt }));
  const expiresAt = new Date(Date.parse(issuedAt) + ADMIN_MOBILE_SESSION_SECONDS * 1000).toISOString();
  return { token, expiresAt, issuedAt };
}

/** The admin in the shape the app keeps (src/context/AdminSessionContext). */
export function serializeAdmin(claims: AdminClaims, issuedAt?: string) {
  return {
    role: claims.role,
    email: claims.email,
    name: claims.name || claims.email,
    permissions: claims.role === "super_admin" ? ["all"] : claims.permissions || [],
    memberId: claims.memberId || null,
    source: claims.source === "team_cookie" ? "team_cookie" : "admin_login",
    teamRoleTitle: claims.teamRoleTitle ?? null,
    department: claims.department ?? null,
    adminRoleName: claims.adminRoleName ?? null,
    issuedAt: issuedAt || claims.issuedAt || new Date().toISOString(),
  };
}

export function adminMobileJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// ---- Admin → team portal bridge (shared by /api/admin/team-bridge and the app) ----

interface BridgeTeamMember {
  id: string;
  email: string;
  is_active: boolean;
  is_sub_admin: boolean;
}

async function ensureSuperAdminTeamMember() {
  const existing = await glashMaybeOne<{ id: string }>(
    `select id
       from public.team_members
      where lower(email) = lower($1)
         or lower(username) = lower($2)
      order by created_at asc
      limit 1`,
    [SUPER_ADMIN_EMAIL, SUPER_ADMIN_USERNAME],
  );

  if (existing?.id) {
    await glashQuery(
      `update public.team_members
          set is_active = true,
              is_sub_admin = true,
              permissions = case
                when 'all' = any(permissions) then permissions
                else array(select distinct unnest(permissions || array['all']::text[]))
              end,
              role_title = coalesce(role_title, 'Super Admin'),
              department = coalesce(department, 'Management'),
              invite_filled = true,
              updated_at = now()
        where id = $1`,
      [existing.id],
    );
    return existing.id;
  }

  const salt = generateSalt();
  const password = crypto.randomBytes(32).toString("hex");
  const created = await glashOne<{ id: string }>(
    `insert into public.team_members
      (full_name, email, username, password_hash, password_salt, role_title, department,
       is_active, is_sub_admin, permissions, invite_filled, language)
     values ($1,$2,$3,$4,$5,'Super Admin','Management',true,true,array['all']::text[],true,'en')
     returning id`,
    ["CDS Space Super Admin", SUPER_ADMIN_EMAIL, SUPER_ADMIN_USERNAME, hashPassword(password, salt), salt],
  );
  return created.id;
}

/** The active sub-admin team member an admin session belongs to, or null. */
export async function resolveAdminTeamMember(
  admin: { role: "super_admin" | "sub_admin"; memberId?: string; email: string },
): Promise<BridgeTeamMember | null> {
  if (admin.role === "super_admin") {
    const id = await ensureSuperAdminTeamMember();
    return { id, email: SUPER_ADMIN_EMAIL, is_active: true, is_sub_admin: true };
  }

  let member: BridgeTeamMember | null = null;
  if (admin.memberId && UUID_PATTERN.test(admin.memberId)) {
    member = await glashMaybeOne<BridgeTeamMember>(
      `select id, email, is_active, is_sub_admin
         from public.team_members
        where id = $1
        limit 1`,
      [admin.memberId],
    );
  }

  // Email is retained only as a compatibility fallback for older signed admin
  // sessions created before stable team-member IDs were embedded in them.
  if (!member && !admin.memberId) {
    member = await glashMaybeOne<BridgeTeamMember>(
      `select id, email, is_active, is_sub_admin
         from public.team_members
        where lower(email) = lower($1)
        order by created_at asc
        limit 1`,
      [admin.email],
    );
  }

  if (!member?.is_active || !member.is_sub_admin) return null;
  return member;
}
