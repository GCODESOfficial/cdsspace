import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import {
  TEAM_SESSION_COOKIE,
  generateSalt,
  hashPassword,
  sessionCookieOptions,
} from "@/lib/team-auth";
import { createTeamSession } from "@/lib/team-login-security";
import { glashMaybeOne, glashOne, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPER_ADMIN_EMAIL = "ceo@cdsspace.pro";
const SUPER_ADMIN_USERNAME = "superadmin";

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

export async function POST(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin || admin.role !== "super_admin") {
    return NextResponse.json({ ok: false, error: "Only super-admin can bridge to team." }, { status: 403 });
  }

  const memberId = await ensureSuperAdminTeamMember();
  const { sessionToken, deviceType, member } = await createTeamSession(memberId, req);
  const res = NextResponse.json({ ok: true, member, device_type: deviceType });
  res.cookies.set(TEAM_SESSION_COOKIE, sessionToken, sessionCookieOptions());
  return res;
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
