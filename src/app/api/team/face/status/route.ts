import { NextRequest, NextResponse } from "next/server";
import { TEAM_SESSION_COOKIE, sessionCookieOptions } from "@/lib/team-auth";
import { getChallengeFromHandoffCode } from "@/lib/face-verification";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import {
  createTeamSession,
  getLoginOfficeRequirement,
  recordLoginAttendance,
} from "@/lib/team-login-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") || "";
  if (!code.trim()) {
    return NextResponse.json({ ok: false, error: "Face handoff code is required." }, { status: 400 });
  }

  const challenge = await getChallengeFromHandoffCode(code);
  if (!challenge) {
    return NextResponse.json({ ok: false, error: "Face handoff code was not found." }, { status: 404 });
  }

  if (new Date(challenge.expires_at) < new Date()) {
    return NextResponse.json({ ok: true, status: "expired" });
  }

  if (challenge.result !== "passed" || !challenge.consumed_at) {
    return NextResponse.json({ ok: true, status: "pending" });
  }

  const metadata = challenge.metadata && typeof challenge.metadata === "object" ? challenge.metadata as Record<string, unknown> : {};
  const faceEventId = typeof metadata.event_id === "string" ? metadata.event_id : null;
  if (!faceEventId) {
    return NextResponse.json({ ok: false, error: "Face handoff is missing a verification event." }, { status: 409 });
  }

  const event = await glashMaybeOne<{ id: string; success: boolean; created_at: string }>(
    "select id, success, created_at from public.team_face_verification_events where id = $1 and team_member_id = $2 limit 1",
    [faceEventId, challenge.team_member_id],
  );
  if (!event?.success) {
    return NextResponse.json({ ok: false, error: "Face verification was not successful." }, { status: 409 });
  }

  const requirement = await getLoginOfficeRequirement(challenge.team_member_id);
  const member = await glashMaybeOne(
    "select id, full_name, username, is_sub_admin from public.team_members where id = $1 limit 1",
    [challenge.team_member_id],
  );

  if (requirement.officeRequired) {
    return NextResponse.json({
      ok: true,
      status: "passed",
      requires_geofence: true,
      face_event_id: faceEventId,
      member,
    });
  }

  const { member: sessionMember, sessionToken, deviceType } = await createTeamSession(challenge.team_member_id, req, { source: "face_phone_handoff" });
  await recordLoginAttendance({
    req,
    memberId: challenge.team_member_id,
    faceEventId,
    faceVerified: true,
    flags: ["face_verified_phone_handoff"],
  });

  const res = NextResponse.json({
    ok: true,
    status: "authenticated",
    member: sessionMember || member,
    device_type: deviceType,
  });
  res.cookies.set(TEAM_SESSION_COOKIE, sessionToken, sessionCookieOptions());
  return res;
}
