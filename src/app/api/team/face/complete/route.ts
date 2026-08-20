/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import {
  TEAM_SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/team-auth";
import {
  FACE_DESCRIPTOR_VERSION,
  FACE_LIVENESS_THRESHOLD,
  FACE_MATCH_THRESHOLD,
  createFaceEvent,
  descriptorDistance,
  descriptorFromJson,
  faceDescriptor,
  getChallengeFromHandoffCode,
  getChallengeFromToken,
  livenessScore,
  parseImageDataUrl,
} from "@/lib/face-verification";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import {
  createTeamSession,
  getLoginOfficeRequirement,
  recordLoginAttendance,
} from "@/lib/team-login-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;
}

function captureEvidence(neutralImage: string, challengeImages: any[]) {
  return {
    neutralImageData: neutralImage || null,
    challengeImages: challengeImages.map((item: any) => ({
      action: String(item?.action || ""),
      image: String(item?.image || ""),
    })),
  };
}

async function failChallenge(
  challenge: any,
  req: NextRequest,
  reason: string,
  scores: { live?: number; match?: number } = {},
  evidence?: ReturnType<typeof captureEvidence>,
) {
  await glashQuery(
    `update public.team_face_challenges
     set result = 'failed', consumed_at = now(), metadata = $1::jsonb
     where id = $2`,
    [JSON.stringify({ failure_reason: reason }), challenge.id],
  );
  await createFaceEvent({
    teamMemberId: challenge.team_member_id,
    challengeId: challenge.id,
    eventType: challenge.purpose === "enrollment" ? "enrollment" : "login",
    success: false,
    livenessScore: scores.live ?? null,
    matchScore: scores.match ?? null,
    failureReason: reason,
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent"),
    neutralImageData: evidence?.neutralImageData || null,
    challengeImages: evidence?.challengeImages || [],
    flagged: scores.match != null && scores.match > FACE_MATCH_THRESHOLD,
    reviewStatus: scores.match != null && scores.match > FACE_MATCH_THRESHOLD ? "flagged" : "clear",
    reviewNote: scores.match != null && scores.match > FACE_MATCH_THRESHOLD
      ? "Capture did not match the enrolled face profile."
      : null,
  });
  return NextResponse.json({ ok: false, error: reason }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token || "");
  const neutralImage = String(body?.neutral_image || "");
  const challengeImages = Array.isArray(body?.challenge_images) ? body.challenge_images : [];
  const handoff = body?.handoff === true;

  if (!token || !neutralImage || challengeImages.length === 0) {
    return NextResponse.json({ ok: false, error: "Face challenge token and images are required." }, { status: 400 });
  }

  try {
    const evidence = captureEvidence(neutralImage, challengeImages);
    const challenge = token.startsWith("mobile:")
      ? await getChallengeFromHandoffCode(token.slice("mobile:".length))
      : await getChallengeFromToken(token);
    if (!challenge || challenge.consumed_at) {
      return NextResponse.json({ ok: false, error: "Face challenge is invalid or already used." }, { status: 401 });
    }
    if (new Date(challenge.expires_at) < new Date()) {
      await glashQuery(
        "update public.team_face_challenges set result = 'expired', consumed_at = now() where id = $1",
        [challenge.id],
      );
      return NextResponse.json({ ok: false, error: "Face challenge has expired. Sign in again." }, { status: 401 });
    }

    const expectedActions = challenge.challenge_actions || [];
    const submittedActions = challengeImages.map((item: any) => String(item?.action || ""));
    const missingAction = expectedActions.find((action: string) => !submittedActions.includes(action));
    if (missingAction) {
      return failChallenge(challenge, req, `Missing liveness action: ${missingAction}`, {}, evidence);
    }

    const neutralDescriptor = await faceDescriptor(parseImageDataUrl(neutralImage));
    const actionDescriptors = await Promise.all(
      challengeImages.map((item: any) => faceDescriptor(parseImageDataUrl(String(item?.image || "")))),
    );
    const liveScore = livenessScore(neutralDescriptor, actionDescriptors);
    if (liveScore < FACE_LIVENESS_THRESHOLD) {
      return failChallenge(challenge, req, "Liveness check failed. Please retry with clearer head/eye movement.", { live: liveScore }, evidence);
    }

    let matchScore: number | null = null;
    let success = true;
    const eventType: "enrollment" | "login" = challenge.purpose === "enrollment" ? "enrollment" : "login";

    if (challenge.purpose === "enrollment") {
      await glashQuery(
        `insert into public.team_face_profiles
          (team_member_id, descriptor, descriptor_version, status, enrolled_at, last_verified_at,
           enrollment_attempts, verification_failures, metadata, enrollment_image_data,
           latest_capture_image_data, latest_capture_at, latest_liveness_score, latest_match_score,
           latest_verification_flag, reset_requested_at, reset_requested_by)
         values ($1,$2::jsonb,$3,'active',now(),now(),1,0,$4::jsonb,$5,$5,now(),$6,null,null,null,null)
         on conflict (team_member_id) do update set
           descriptor = excluded.descriptor,
           descriptor_version = excluded.descriptor_version,
           status = 'active',
           updated_at = now(),
           last_verified_at = now(),
           enrollment_attempts = public.team_face_profiles.enrollment_attempts + 1,
           verification_failures = 0,
           metadata = excluded.metadata,
           enrollment_image_data = excluded.enrollment_image_data,
           latest_capture_image_data = excluded.latest_capture_image_data,
           latest_capture_at = excluded.latest_capture_at,
           latest_liveness_score = excluded.latest_liveness_score,
           latest_match_score = excluded.latest_match_score,
           latest_verification_flag = null,
           reset_requested_at = null,
           reset_requested_by = null`,
        [
          challenge.team_member_id,
          JSON.stringify(neutralDescriptor),
          FACE_DESCRIPTOR_VERSION,
          JSON.stringify({
            liveness_score: liveScore,
            challenge_actions: expectedActions,
            note: "Enrollment capture is stored for super-admin face review.",
          }),
          evidence.neutralImageData,
          liveScore,
        ],
      );
    } else {
      const profile = await glashMaybeOne<{
        descriptor: unknown;
        status: string;
        verification_failures: number | null;
      }>(
        "select descriptor, status, verification_failures from public.team_face_profiles where team_member_id = $1 limit 1",
        [challenge.team_member_id],
      );
      if (!profile || profile.status !== "active") {
        return failChallenge(challenge, req, "Face profile is not enrolled or is disabled.", { live: liveScore }, evidence);
      }
      matchScore = descriptorDistance(descriptorFromJson(profile.descriptor), neutralDescriptor);
      success = matchScore <= FACE_MATCH_THRESHOLD;
      if (!success) {
        await glashQuery(
          `update public.team_face_profiles
           set verification_failures = coalesce(verification_failures, 0) + 1,
               latest_capture_image_data = $2,
               latest_capture_at = now(),
               latest_liveness_score = $3,
               latest_match_score = $4,
               latest_verification_flag = 'face_mismatch'
           where team_member_id = $1`,
          [challenge.team_member_id, evidence.neutralImageData, liveScore, matchScore],
        );
        return failChallenge(challenge, req, "Face verification failed. Please retry with better lighting.", { live: liveScore, match: matchScore }, evidence);
      }
      await glashQuery(
        `update public.team_face_profiles
         set last_verified_at = now(),
             verification_failures = 0,
             latest_capture_image_data = $2,
             latest_capture_at = now(),
             latest_liveness_score = $3,
             latest_match_score = $4,
             latest_verification_flag = null
         where team_member_id = $1`,
        [challenge.team_member_id, evidence.neutralImageData, liveScore, matchScore],
      );
    }

    const event = await createFaceEvent({
      teamMemberId: challenge.team_member_id,
      challengeId: challenge.id,
      eventType,
      success,
      livenessScore: liveScore,
      matchScore,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent"),
      metadata: {
        challenge_actions: expectedActions,
        descriptor_version: FACE_DESCRIPTOR_VERSION,
      },
      neutralImageData: evidence.neutralImageData,
      challengeImages: evidence.challengeImages,
      flagged: false,
      reviewStatus: "clear",
    });

    await glashQuery(
      `update public.team_face_profiles
       set latest_verification_event_id = $2
       where team_member_id = $1`,
      [challenge.team_member_id, event.id],
    ).catch(() => []);

    await glashQuery(
      `update public.team_face_challenges
       set result = 'passed', consumed_at = now(), metadata = $1::jsonb
       where id = $2`,
      [JSON.stringify({ event_id: event.id }), challenge.id],
    );

    const requirement = await getLoginOfficeRequirement(challenge.team_member_id);
    if (requirement.officeRequired) {
      const member = await glashMaybeOne(
        "select id, full_name, username, is_sub_admin from public.team_members where id = $1 limit 1",
        [challenge.team_member_id],
      );
      return NextResponse.json({
        ok: true,
        requires_geofence: true,
        face_event_id: event.id,
        liveness_score: liveScore,
        match_score: matchScore,
        member,
      });
    }

    if (handoff) {
      const member = await glashMaybeOne(
        "select id, full_name, username, is_sub_admin from public.team_members where id = $1 limit 1",
        [challenge.team_member_id],
      );
      return NextResponse.json({
        ok: true,
        handoff: true,
        face_event_id: event.id,
        liveness_score: liveScore,
        match_score: matchScore,
        member,
      });
    }

    const { member, sessionToken, deviceType } = await createTeamSession(challenge.team_member_id, req, { source: "face_login" });
    await recordLoginAttendance({
      req,
      memberId: challenge.team_member_id,
      faceEventId: event.id,
      faceVerified: true,
      flags: ["face_verified_login"],
    });

    const res = NextResponse.json({
      ok: true,
      face_event_id: event.id,
      liveness_score: liveScore,
      match_score: matchScore,
      member,
      device_type: deviceType,
    });
    res.cookies.set(TEAM_SESSION_COOKIE, sessionToken, sessionCookieOptions());
    return res;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Face verification failed." },
      { status: 500 },
    );
  }
}
