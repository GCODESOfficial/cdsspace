import { cookies, headers } from "next/headers";
import crypto from "crypto";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { sessionRequiresDailyLogout } from "@/lib/team-session-policy";
import { parseTeamBearer } from "@/lib/team-mobile-session-core.mjs";

export const TEAM_SESSION_COOKIE = "team_session";
const SESSION_DAYS = 30;
export type TeamDeviceType = "desktop" | "mobile";

export function hashPassword(password: string, salt: string): string {
  return crypto.createHash("sha256").update(password + ":" + salt).digest("hex");
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generateInviteToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function teamSessionExpiresAt() {
  return new Date(Date.now() + 1000 * 60 * 60 * 24 * SESSION_DAYS).toISOString();
}

export function clientIpFromHeaders(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")
    || null;
}

export function deviceTypeFromUserAgent(userAgent = ""): TeamDeviceType {
  const ua = userAgent.toLowerCase();
  return /mobile|android|iphone|ipod|iemobile|opera mini|blackberry/.test(ua) ? "mobile" : "desktop";
}

export interface TeamSession {
  id: string;
  full_name: string;
  email: string;
  email_verified_at: string | null;
  username: string;
  avatar_url: string | null;
  role_title: string | null;
  department: string | null;
  is_sub_admin: boolean;
  permissions: string[];
  language: string | null;
  device_type?: TeamDeviceType;
}

/**
 * Recently verified sessions, held per server instance.
 *
 * Every portal page load verifies the session token against the database, so a
 * phone moving between pages asked the same question over and over, and a
 * single slow answer stranded the person on "portal temporarily unavailable".
 * A fresh answer is reused for a few seconds, and a verified session is held
 * longer as a safety net used only while the database is failing, so an outage
 * no longer signs anyone out. Sign-out and the daily cutoff clear it at once.
 */
const verifiedSessions = new Map<string, { session: TeamSession; at: number }>();
const SESSION_CACHE_MS = 5_000;
const SESSION_OUTAGE_GRACE_MS = 10 * 60_000;

export function forgetCachedTeamSession(token?: string | null) {
  if (token) verifiedSessions.delete(token);
  else verifiedSessions.clear();
}

export async function getTeamSessionFromToken(token: string | undefined | null): Promise<TeamSession | null> {
  if (!token) return null;

  const cached = verifiedSessions.get(token);
  if (cached && Date.now() - cached.at < SESSION_CACHE_MS) return cached.session;

  let data;
  try {
    data = await glashMaybeOne<{
    id: string;
    full_name: string;
    email: string;
    email_verified_at: string | null;
    username: string;
    avatar_url: string | null;
    role_title: string | null;
    department: string | null;
    is_sub_admin: boolean;
    permissions: string[] | null;
    language: string | null;
    session_expires_at: string | null;
    session_created_at: string;
    is_active: boolean;
    device_type: TeamDeviceType | null;
  }>(
    `select m.id, m.full_name, m.email, m.email_verified_at, m.username, m.avatar_url, m.role_title, m.department,
      m.is_sub_admin, m.permissions, m.language, s.expires_at as session_expires_at,
      s.created_at as session_created_at, m.is_active,
      s.device_type
     from public.team_device_sessions s
     join public.team_members m on m.id = s.team_member_id
     where s.session_token = $1
       and s.revoked_at is null
     limit 1`,
    [token],
    );
  } catch (primaryError) {
    if (cached && Date.now() - cached.at < SESSION_OUTAGE_GRACE_MS) return cached.session;
    // Older installations may not have the device-session table yet. Only
    // treat this as an invalid session if the legacy lookup succeeds and
    // genuinely finds no token; if both reads fail, surface a transient error
    // so dashboard shells do not incorrectly send a valid user to login.
    try {
      return await getLegacyTeamSessionFromToken(token);
    } catch {
      throw primaryError;
    }
  }

  if (!data) {
    return getLegacyTeamSessionFromToken(token);
  }

  if (!data || !data.is_active) return null;
  if (sessionRequiresDailyLogout(data.session_created_at)) {
    await glashQuery(
      "update public.team_device_sessions set revoked_at = now(), revoke_reason = 'daily_1815_cutoff' where session_token = $1 and revoked_at is null",
      [token],
    ).catch(() => []);
    await glashQuery(
      "update public.team_members set session_token = null, session_expires_at = null where session_token = $1",
      [token],
    ).catch(() => []);
    verifiedSessions.delete(token);
    return null;
  }
  if (data.session_expires_at && new Date(data.session_expires_at) < new Date()) {
    await glashQuery(
      "update public.team_device_sessions set revoked_at = now(), revoke_reason = 'expired' where session_token = $1",
      [token],
    ).catch(() => []);
    verifiedSessions.delete(token);
    return null;
  }

  await glashQuery(
    "update public.team_device_sessions set last_seen_at = now() where session_token = $1",
    [token],
  ).catch(() => []);

  const session: TeamSession = {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
    email_verified_at: data.email_verified_at,
    username: data.username,
    avatar_url: data.avatar_url,
    role_title: data.role_title,
    department: data.department,
    is_sub_admin: !!data.is_sub_admin,
    permissions: data.permissions || [],
    language: data.language ?? "en",
    device_type: data.device_type || undefined,
  };
  verifiedSessions.set(token, { session, at: Date.now() });
  return session;
}

async function getLegacyTeamSessionFromToken(token: string): Promise<TeamSession | null> {
  const data = await glashMaybeOne<{
    id: string;
    full_name: string;
    email: string;
    email_verified_at: string | null;
    username: string;
    avatar_url: string | null;
    role_title: string | null;
    department: string | null;
    is_sub_admin: boolean;
    permissions: string[] | null;
    language: string | null;
    session_expires_at: string | null;
    is_active: boolean;
  }>(
    `select id, full_name, email, email_verified_at, username, avatar_url, role_title, department,
      is_sub_admin, permissions, language, session_expires_at, is_active
     from public.team_members
     where session_token = $1
     limit 1`,
    [token],
  );

  if (!data || !data.is_active) return null;
  // Legacy sessions have no trustworthy issue timestamp, so they cannot
  // prove that the member deliberately signed in after the latest cutoff.
  // Clear them and require the normal login flow to issue a device session.
  await glashQuery(
    "update public.team_members set session_token = null, session_expires_at = null where id = $1",
    [data.id],
  ).catch(() => []);
  return null;
}

/** The mobile app's team session token ("Authorization: Bearer cdst1.…"), if any. */
export async function readTeamBearerToken(): Promise<string | null> {
  const requestHeaders = await headers();
  return parseTeamBearer(requestHeaders.get("authorization"));
}

/**
 * Server-only: read the currently logged-in team member from the session cookie,
 * or from the mobile app's Bearer token. An explicit Bearer token wins, so a
 * stray cookie in the phone's cookie jar never stands in for the app's session.
 */
export async function getTeamSession(): Promise<TeamSession | null> {
  const bearer = await readTeamBearerToken();
  if (bearer) return getTeamSessionFromToken(bearer);
  const store = await cookies();
  const token = store.get(TEAM_SESSION_COOKIE)?.value;
  return getTeamSessionFromToken(token);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  };
}
