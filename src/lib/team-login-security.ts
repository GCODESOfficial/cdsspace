import crypto from "crypto";
import { type NextRequest } from "next/server";
import {
  attendanceScores,
  attendanceStatus,
  isWorkDay,
  lagosDate,
  locationFlags,
  officeRequiredFor,
  type WorkMode,
} from "@/lib/timebook";
import {
  clientIpFromHeaders,
  deviceTypeFromUserAgent,
  generateSessionToken,
  teamSessionExpiresAt,
} from "@/lib/team-auth";
import { glashMaybeOne, glashOne, glashQuery } from "@/lib/glashdb/postgres";

export interface TeamLocationInput {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  clientCapturedAt?: string | null;
}

export function locationFromPayload(value: unknown): TeamLocationInput {
  const loc = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    latitude: loc.latitude == null ? null : Number(loc.latitude),
    longitude: loc.longitude == null ? null : Number(loc.longitude),
    accuracy: loc.accuracy == null ? null : Number(loc.accuracy),
    clientCapturedAt: typeof loc.captured_at === "string" ? loc.captured_at : null,
  };
}

export function bypassCodeHash(code: string) {
  return crypto.createHash("sha256").update(code.trim().toUpperCase().replace(/\s+/g, "")).digest("hex");
}

export async function validateTeamBypassCode(code: string, memberId: string) {
  const normalized = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;
  const bypass = await glashMaybeOne<{
    id: string;
    status: string;
    expires_at: string;
    assigned_team_member_id: string | null;
    reason: string | null;
  }>(
    `select id, status, expires_at, assigned_team_member_id, reason
     from public.team_geofence_bypass_codes
     where code_hash = $1
     limit 1`,
    [bypassCodeHash(normalized)],
  );
  if (!bypass) throw new Error("Invalid team bypass code.");
  if (bypass.status !== "active") throw new Error("This team bypass code is no longer active.");
  if (new Date(bypass.expires_at) < new Date()) {
    await glashQuery("update public.team_geofence_bypass_codes set status = 'expired' where id = $1", [bypass.id]);
    throw new Error("This team bypass code has expired.");
  }
  if (bypass.assigned_team_member_id && bypass.assigned_team_member_id !== memberId) {
    throw new Error("This team bypass code was generated for another team member.");
  }
  return bypass;
}

export async function ensureTeamTimeProfile(memberId: string) {
  const existing = await glashMaybeOne<{
    team_member_id: string;
    work_mode: WorkMode;
    hybrid_office_days: number[] | null;
    flexible_break_enabled: boolean;
  }>(
    "select * from public.team_time_profiles where team_member_id = $1 limit 1",
    [memberId],
  );
  if (existing) return existing;
  return glashOne<{
    team_member_id: string;
    work_mode: WorkMode;
    hybrid_office_days: number[] | null;
    flexible_break_enabled: boolean;
  }>(
    `insert into public.team_time_profiles (team_member_id, work_mode, hybrid_office_days)
     values ($1, 'onsite', '{}')
     returning *`,
    [memberId],
  );
}

export async function getLoginOfficeRequirement(memberId: string, workDate = lagosDate()) {
  const profile = await ensureTeamTimeProfile(memberId);
  const officeRequired = isWorkDay(workDate)
    && officeRequiredFor(profile.work_mode, profile.hybrid_office_days ?? [], workDate);
  return { profile, workDate, officeRequired };
}

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;
}

export async function createTeamSession(memberId: string, req?: { headers: Headers }) {
  const sessionToken = generateSessionToken();
  const expiresAt = teamSessionExpiresAt();
  const userAgent = req?.headers.get("user-agent") || "";
  const deviceType = deviceTypeFromUserAgent(userAgent);

  await glashQuery(
    `update public.team_device_sessions
     set revoked_at = now(), revoke_reason = 'replaced_by_new_login'
     where team_member_id = $1
       and device_type = $2
       and revoked_at is null`,
    [memberId, deviceType],
  ).catch(() => []);

  await glashQuery(
    `insert into public.team_device_sessions
      (team_member_id, session_token, device_type, user_agent, ip_address, expires_at, metadata)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      memberId,
      sessionToken,
      deviceType,
      userAgent || null,
      req ? clientIpFromHeaders(req.headers) : null,
      expiresAt,
      JSON.stringify({ policy: "one_desktop_one_mobile" }),
    ],
  );

  const member = await glashOne<{
    id: string;
    full_name: string;
    username: string;
    is_sub_admin: boolean;
  }>(
    `update public.team_members
     set session_token = $1, session_expires_at = $2
     where id = $3
     returning id, full_name, username, is_sub_admin`,
    [sessionToken, expiresAt, memberId],
  );
  return { sessionToken, expiresAt, member, deviceType };
}

export async function recordLoginAttendance(input: {
  req: NextRequest;
  memberId: string;
  faceEventId?: string | null;
  faceVerified: boolean;
  location?: TeamLocationInput;
  bypass?: { id: string; reason: string | null } | null;
  bypassReason?: string | null;
  flags?: string[];
}) {
  const workDate = lagosDate();
  const now = new Date().toISOString();
  const { profile, officeRequired } = await getLoginOfficeRequirement(input.memberId, workDate);
  const loc = input.location ?? {};
  const geo = locationFlags(loc);
  const status = attendanceStatus(now);
  const flags = Array.from(new Set([
    ...geo.flags,
    ...(input.flags ?? []),
    ...(input.bypass ? ["team_bypass_code"] : []),
  ]));

  const entry = await glashOne<{
    id: string;
    team_member_id: string;
    work_date: string;
  }>(
    `insert into public.team_time_entries (
       team_member_id, work_date, work_mode, office_required, attendance_status, current_status,
       clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy,
       clock_in_distance_meters, clock_in_inside_geofence,
       last_location_lat, last_location_lng, last_location_accuracy,
       last_location_distance_meters, last_location_inside_geofence, last_location_at,
       geofence_bypass_code_id, geofence_bypass_reason,
       clock_in_face_verified, clock_in_face_event_id,
       flags, scores
     )
     values ($1,$2,$3,$4,$5,'available',$6,$7,$8,$9,$10,$11,$7,$8,$9,$10,$11,$6,$12,$13,$14,$15,$16::text[],$17::jsonb)
     on conflict (team_member_id, work_date) do update set
       work_mode = excluded.work_mode,
       office_required = excluded.office_required,
       current_status = case
         when public.team_time_entries.clock_out_at is null then 'available'
         else public.team_time_entries.current_status
       end,
       clock_in_at = coalesce(public.team_time_entries.clock_in_at, excluded.clock_in_at),
       clock_in_lat = coalesce(public.team_time_entries.clock_in_lat, excluded.clock_in_lat),
       clock_in_lng = coalesce(public.team_time_entries.clock_in_lng, excluded.clock_in_lng),
       clock_in_accuracy = coalesce(public.team_time_entries.clock_in_accuracy, excluded.clock_in_accuracy),
       clock_in_distance_meters = coalesce(public.team_time_entries.clock_in_distance_meters, excluded.clock_in_distance_meters),
       clock_in_inside_geofence = coalesce(public.team_time_entries.clock_in_inside_geofence, excluded.clock_in_inside_geofence),
       last_location_lat = excluded.last_location_lat,
       last_location_lng = excluded.last_location_lng,
       last_location_accuracy = excluded.last_location_accuracy,
       last_location_distance_meters = excluded.last_location_distance_meters,
       last_location_inside_geofence = excluded.last_location_inside_geofence,
       last_location_at = excluded.last_location_at,
       geofence_bypass_code_id = coalesce(public.team_time_entries.geofence_bypass_code_id, excluded.geofence_bypass_code_id),
       geofence_bypass_reason = coalesce(public.team_time_entries.geofence_bypass_reason, excluded.geofence_bypass_reason),
       clock_in_face_verified = public.team_time_entries.clock_in_face_verified or excluded.clock_in_face_verified,
       clock_in_face_event_id = coalesce(public.team_time_entries.clock_in_face_event_id, excluded.clock_in_face_event_id),
       flags = array(select distinct unnest(public.team_time_entries.flags || excluded.flags)),
       scores = case when public.team_time_entries.scores = '{}'::jsonb then excluded.scores else public.team_time_entries.scores end
     returning *`,
    [
      input.memberId,
      workDate,
      profile.work_mode || "onsite",
      officeRequired,
      status,
      now,
      loc.latitude ?? null,
      loc.longitude ?? null,
      loc.accuracy ?? null,
      geo.distance,
      geo.inside,
      input.bypass?.id ?? null,
      input.bypassReason ?? input.bypass?.reason ?? null,
      input.faceVerified,
      input.faceEventId ?? null,
      flags,
      attendanceScores(status, 0, 0),
    ],
  );

  await glashQuery(
    `insert into public.team_time_events
      (entry_id, team_member_id, event_type, work_date, to_status, latitude, longitude, accuracy,
       distance_meters, inside_geofence, ip_address, user_agent, flags, metadata)
     values ($1,$2,'clock_in',$3,'available',$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
    [
      entry.id,
      input.memberId,
      workDate,
      loc.latitude ?? null,
      loc.longitude ?? null,
      loc.accuracy ?? null,
      geo.distance,
      geo.inside,
      clientIp(input.req),
      input.req.headers.get("user-agent"),
      flags,
      JSON.stringify({
        source: "team_login",
        face_event_id: input.faceEventId ?? null,
        face_verified: input.faceVerified,
        bypass_code_id: input.bypass?.id ?? null,
      }),
    ],
  ).catch(() => []);

  if (input.bypass) {
    await glashQuery(
      `update public.team_geofence_bypass_codes
       set used_by = $1, used_entry_id = $2, used_at = $3
       where id = $4`,
      [input.memberId, entry.id, now, input.bypass.id],
    );
  }

  return { entry, profile, workDate, officeRequired, geo };
}
