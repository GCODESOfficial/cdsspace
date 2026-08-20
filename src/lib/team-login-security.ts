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
import { glashMaybeOne, glashOne, glashPool, glashQuery } from "@/lib/glashdb/postgres";
import { insertActivityLog } from "@/lib/activity-log";

export interface TeamLocationInput {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  clientCapturedAt?: string | null;
}

export interface TeamLoginClientDevice {
  platform?: string | null;
  timezone?: string | null;
  language?: string | null;
  screen?: string | null;
}

export interface TeamSessionContext {
  source?: string;
  location?: TeamLocationInput;
  clientDevice?: TeamLoginClientDevice;
}

export function locationFromPayload(value: unknown): TeamLocationInput {
  const loc = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const finite = (candidate: unknown) => {
    if (candidate == null) return null;
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const latitude = finite(loc.latitude);
  const longitude = finite(loc.longitude);
  const accuracy = finite(loc.accuracy);
  return {
    latitude: latitude != null && latitude >= -90 && latitude <= 90 ? latitude : null,
    longitude: longitude != null && longitude >= -180 && longitude <= 180 ? longitude : null,
    accuracy: accuracy != null && accuracy >= 0 ? accuracy : null,
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

function decodedHeader(headers: Headers, name: string) {
  const value = headers.get(name)?.trim();
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return value; }
}

function browserFromUserAgent(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/Chrome\//i.test(userAgent) || /CriOS\//i.test(userAgent)) return "Google Chrome";
  if (/Firefox\//i.test(userAgent) || /FxiOS\//i.test(userAgent)) return "Mozilla Firefox";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return userAgent ? "Other browser" : "Unknown browser";
}

function osFromUserAgent(userAgent: string) {
  if (/Windows NT 10/i.test(userAgent)) return "Windows 10/11";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS/iPadOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/CrOS/i.test(userAgent)) return "ChromeOS";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown operating system";
}

function headerLocation(headers: Headers) {
  const city = decodedHeader(headers, "x-vercel-ip-city") || decodedHeader(headers, "cf-ipcity");
  const region = decodedHeader(headers, "x-vercel-ip-country-region") || decodedHeader(headers, "cf-region");
  const country = decodedHeader(headers, "x-vercel-ip-country") || decodedHeader(headers, "cf-ipcountry");
  return { city, region, country };
}

export async function createTeamSession(memberId: string, req?: { headers: Headers }, context: TeamSessionContext = {}) {
  const sessionToken = generateSessionToken();
  const expiresAt = teamSessionExpiresAt();
  const userAgent = req?.headers.get("user-agent") || "";
  const deviceType = deviceTypeFromUserAgent(userAgent);
  const browserName = browserFromUserAgent(userAgent);
  const osName = osFromUserAgent(userAgent);
  const platform = context.clientDevice?.platform?.trim() || null;
  const deviceName = platform ? `${platform} · ${browserName}` : `${osName} · ${browserName}`;
  const ipAddress = req ? clientIpFromHeaders(req.headers) : null;
  const inferredLocation = req ? headerLocation(req.headers) : { city: null, region: null, country: null };
  const latitude = context.location?.latitude ?? null;
  const longitude = context.location?.longitude ?? null;
  const location = [inferredLocation.city, inferredLocation.region, inferredLocation.country].filter(Boolean).join(", ")
    || (latitude != null && longitude != null ? `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}` : "Location unavailable");
  const source = context.source || "team_session";
  const metadata = {
    policy: "one_active_device",
    platform,
    language: context.clientDevice?.language || null,
    screen: context.clientDevice?.screen || null,
    location_accuracy: context.location?.accuracy ?? null,
    client_captured_at: context.location?.clientCapturedAt ?? null,
  };
  const client = await glashPool.connect();
  let replacedSessionCount = 0;
  let sessionId = "";
  let member: {
    id: string;
    full_name: string;
    username: string;
    is_sub_admin: boolean;
  };
  try {
    await client.query("begin");
    await client.query("select id from public.team_members where id = $1 for update", [memberId]);
    const revoked = await client.query(
      `update public.team_device_sessions
          set revoked_at = now(), revoke_reason = 'replaced_by_new_login'
        where team_member_id = $1 and revoked_at is null
        returning id`,
      [memberId],
    );
    replacedSessionCount = revoked.rowCount || 0;
    const inserted = await client.query<{ id: string }>(
      `insert into public.team_device_sessions
        (team_member_id, session_token, device_type, user_agent, ip_address, expires_at,
         browser_name, os_name, device_name, city, region, country, country_code,
         latitude, longitude, timezone, login_source, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)
       returning id`,
      [
        memberId, sessionToken, deviceType, userAgent || null, ipAddress, expiresAt,
        browserName, osName, deviceName, inferredLocation.city, inferredLocation.region,
        inferredLocation.country, inferredLocation.country, latitude, longitude,
        context.clientDevice?.timezone || null, source, JSON.stringify(metadata),
      ],
    );
    sessionId = inserted.rows[0].id;
    const updated = await client.query<{
      id: string; full_name: string; username: string; is_sub_admin: boolean;
    }>(
      `update public.team_members
          set session_token = $1, session_expires_at = $2
        where id = $3
        returning id, full_name, username, is_sub_admin`,
      [sessionToken, expiresAt, memberId],
    );
    if (!updated.rows[0]) throw new Error("Team member was not found.");
    member = updated.rows[0];
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  await insertActivityLog({
    actor_kind: "team",
    actor_id: member.id,
    actor_name: member.full_name || member.username,
    actor_is_admin: false,
    action: "team.login",
    page: "team/login",
    resource_type: "team_session",
    resource_id: sessionId,
    resource_label: deviceName,
    metadata: {
      source,
      device_type: deviceType,
      device_name: deviceName,
      browser_name: browserName,
      os_name: osName,
      user_agent: userAgent || null,
      ip_address: ipAddress,
      location,
      city: inferredLocation.city,
      region: inferredLocation.region,
      country: inferredLocation.country,
      latitude,
      longitude,
      timezone: context.clientDevice?.timezone || null,
      login_at: new Date().toISOString(),
      replaced_session_count: replacedSessionCount,
    },
  }).catch((error) => console.error("[audit] team login log failed:", error));

  return { sessionToken, expiresAt, member, deviceType, sessionId, replacedSessionCount };
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
