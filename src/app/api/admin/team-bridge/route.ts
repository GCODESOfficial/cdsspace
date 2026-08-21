import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import {
  TEAM_SESSION_COOKIE,
  generateSalt,
  getTeamSessionFromToken,
  hashPassword,
  sessionCookieOptions,
} from "@/lib/team-auth";
import { createTeamSession } from "@/lib/team-login-security";
import { glashMaybeOne, glashOne, glashQuery } from "@/lib/glashdb/postgres";
import { canReuseStaffPortalSession } from "@/lib/staff-portal-identity.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPER_ADMIN_EMAIL = "ceo@cdsspace.pro";
const SUPER_ADMIN_USERNAME = "superadmin";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    [
      "CDS Space Super Admin",
      SUPER_ADMIN_EMAIL,
      SUPER_ADMIN_USERNAME,
      hashPassword(password, salt),
      salt,
    ],
  );
  return created.id;
}

async function resolveAdminTeamMember(
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

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 401 });
    }

    const existingToken = req.cookies.get(TEAM_SESSION_COOKIE)?.value;
    const existingTeam = existingToken
      ? await getTeamSessionFromToken(existingToken)
      : null;
    if (
      existingTeam?.is_sub_admin
      && canReuseStaffPortalSession(admin, existingTeam, SUPER_ADMIN_EMAIL)
    ) {
      return NextResponse.json({
        ok: true,
        reused: true,
        member: existingTeam,
        device_type: existingTeam.device_type,
      });
    }

    const teamMember = await resolveAdminTeamMember(admin);
    if (!teamMember) {
      return NextResponse.json(
        { ok: false, error: "This admin account is not linked to an active team member." },
        { status: 403 },
      );
    }

    const { sessionToken, deviceType, member } = await createTeamSession(teamMember.id, req, { source: "admin_bridge" });
    const res = NextResponse.json({ ok: true, reused: false, member, device_type: deviceType });
    res.cookies.set(TEAM_SESSION_COOKIE, sessionToken, sessionCookieOptions());
    return res;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Portal switching is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function GET(req: NextRequest) {
  const postResponse = await POST(req);
  if (!postResponse.ok) return postResponse;
  const redirect = NextResponse.redirect(new URL("/team", req.url));
  const cookie = postResponse.cookies.get(TEAM_SESSION_COOKIE);
  if (cookie) {
    redirect.cookies.set(TEAM_SESSION_COOKIE, cookie.value, sessionCookieOptions());
  }
  return redirect;
}
