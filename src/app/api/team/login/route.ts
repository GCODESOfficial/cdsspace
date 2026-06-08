import { NextRequest, NextResponse } from "next/server";
import {
  TEAM_SESSION_COOKIE,
  hashPassword,
  sessionCookieOptions,
} from "@/lib/team-auth";
import { createFaceChallenge } from "@/lib/face-verification";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import {
  createTeamSession,
  getLoginOfficeRequirement,
  recordLoginAttendance,
  validateTeamBypassCode,
} from "@/lib/team-login-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { identifier, password } = body;
  if (!identifier?.trim() || !password?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Username/email and password are required" },
      { status: 400 },
    );
  }

  const id = String(identifier).trim().toLowerCase();
  const member = await glashMaybeOne<{
    id: string;
    full_name: string;
    username: string;
    is_sub_admin: boolean;
    is_active: boolean;
    password_salt: string;
    password_hash: string;
  }>(
    `select id, full_name, username, is_sub_admin, is_active, password_salt, password_hash
     from public.team_members
     where lower(email) = $1 or lower(username) = $1
     limit 1`,
    [id],
  );

  if (!member) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }
  if (!member.is_active) {
    return NextResponse.json({ ok: false, error: "Account is inactive" }, { status: 403 });
  }

  const expected = hashPassword(password, member.password_salt);
  if (expected !== member.password_hash) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const bypassCode = String(body?.bypass_code || "").trim();
  if (bypassCode) {
    try {
      const bypass = await validateTeamBypassCode(bypassCode, member.id);
      const { member: sessionMember, sessionToken, deviceType } = await createTeamSession(member.id, req);
      await recordLoginAttendance({
        req,
        memberId: member.id,
        faceVerified: false,
        bypass,
        bypassReason: bypass?.reason || "Team login bypass code",
        flags: ["face_verification_bypass", "geofence_bypass"],
      });
      const res = NextResponse.json({ ok: true, bypassed: true, member: sessionMember, device_type: deviceType });
      res.cookies.set(TEAM_SESSION_COOKIE, sessionToken, sessionCookieOptions());
      return res;
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Invalid team bypass code." },
        { status: 403 },
      );
    }
  }

  const faceProfile = await glashMaybeOne<{ status: string }>(
    "select status from public.team_face_profiles where team_member_id = $1 limit 1",
    [member.id],
  );
  const faceReady = faceProfile?.status === "active";
  const challenge = await createFaceChallenge(
    member.id,
    faceReady ? "verification" : "enrollment",
    { login_identifier: id },
  );
  const requirement = await getLoginOfficeRequirement(member.id);

  return NextResponse.json({
    ok: false,
    requires_face_setup: !faceReady,
    requires_face_verification: faceReady,
    requires_geofence_after_face: requirement.officeRequired,
    face_challenge: challenge,
    member: {
      id: member.id,
      full_name: member.full_name,
      username: member.username,
      is_sub_admin: member.is_sub_admin,
    },
  });
}
