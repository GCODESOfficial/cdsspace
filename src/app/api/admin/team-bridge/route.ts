import { NextRequest, NextResponse } from "next/server";
import { absoluteApplicationUrl } from "@/lib/public-site";
import { getAdminSession } from "@/lib/admin-session";
import {
  TEAM_SESSION_COOKIE,
  getTeamSessionFromToken,
  sessionCookieOptions,
} from "@/lib/team-auth";
import { createTeamSession } from "@/lib/team-login-security";
import { SUPER_ADMIN_EMAIL, resolveAdminTeamMember } from "@/lib/admin-mobile";
import { canReuseStaffPortalSession } from "@/lib/staff-portal-identity.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const redirect = NextResponse.redirect(absoluteApplicationUrl("/team", req));
  const cookie = postResponse.cookies.get(TEAM_SESSION_COOKIE);
  if (cookie) {
    redirect.cookies.set(TEAM_SESSION_COOKIE, cookie.value, sessionCookieOptions());
  }
  return redirect;
}
