import { NextRequest, NextResponse } from "next/server";
import {
  TEAM_SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/team-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import {
  createTeamSession,
  getLoginOfficeRequirement,
  locationFromPayload,
  recordLoginAttendance,
  validateTeamBypassCode,
} from "@/lib/team-login-security";
import { locationFlags } from "@/lib/timebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const faceEventId = String(body?.face_event_id || "");
  if (!faceEventId) {
    return NextResponse.json({ ok: false, error: "Face verification event is required." }, { status: 400 });
  }

  const event = await glashMaybeOne<{
    id: string;
    team_member_id: string;
    success: boolean;
    created_at: string;
  }>(
    `select id, team_member_id, success, created_at
     from public.team_face_verification_events
     where id = $1
     limit 1`,
    [faceEventId],
  );
  if (!event || !event.success) {
    return NextResponse.json({ ok: false, error: "Face verification must be completed first." }, { status: 403 });
  }
  if (Date.now() - new Date(event.created_at).getTime() > 10 * 60 * 1000) {
    return NextResponse.json({ ok: false, error: "Face verification expired. Sign in again." }, { status: 403 });
  }

  const { officeRequired } = await getLoginOfficeRequirement(event.team_member_id);
  const loc = locationFromPayload(body?.location);
  const geo = locationFlags(loc);
  const bypassCode = String(body?.bypass_code || "").trim();
  let bypass = null;

  if (officeRequired && !geo.inside) {
    if (!bypassCode) {
      return NextResponse.json({
        ok: false,
        error: "Office location check failed. You must be within 150m of CDS Space HQ, or enter a super-admin team bypass code.",
        allow_bypass: true,
        distance_meters: geo.distance,
        flags: geo.flags,
      }, { status: 403 });
    }
    try {
      bypass = await validateTeamBypassCode(bypassCode, event.team_member_id);
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "Invalid team bypass code.",
        allow_bypass: true,
        distance_meters: geo.distance,
        flags: geo.flags,
      }, { status: 403 });
    }
  }

  const { member, sessionToken, deviceType } = await createTeamSession(event.team_member_id, req);
  const attendance = await recordLoginAttendance({
    req,
    memberId: event.team_member_id,
    faceEventId: event.id,
    faceVerified: true,
    location: loc,
    bypass,
    bypassReason: bypass?.reason || null,
    flags: ["face_verified_login"],
  });

  const res = NextResponse.json({
    ok: true,
    member,
    device_type: deviceType,
    attendance: attendance.entry,
    distance_meters: attendance.geo.distance,
    inside_geofence: attendance.geo.inside,
    bypassed: !!bypass,
  });
  res.cookies.set(TEAM_SESSION_COOKIE, sessionToken, sessionCookieOptions());
  return res;
}
