import { cookies } from "next/headers";
import crypto from "crypto";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

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
  username: string;
  avatar_url: string | null;
  role_title: string | null;
  department: string | null;
  is_sub_admin: boolean;
  permissions: string[];
  language: string | null;
  device_type?: TeamDeviceType;
}

export async function getTeamSessionFromToken(token: string | undefined | null): Promise<TeamSession | null> {
  if (!token) return null;

  const data = await glashMaybeOne<{
    id: string;
    full_name: string;
    email: string;
    username: string;
    avatar_url: string | null;
    role_title: string | null;
    department: string | null;
    is_sub_admin: boolean;
    permissions: string[] | null;
    language: string | null;
    session_expires_at: string | null;
    is_active: boolean;
    device_type: TeamDeviceType | null;
  }>(
    `select m.id, m.full_name, m.email, m.username, m.avatar_url, m.role_title, m.department,
      m.is_sub_admin, m.permissions, m.language, s.expires_at as session_expires_at, m.is_active,
      s.device_type
     from public.team_device_sessions s
     join public.team_members m on m.id = s.team_member_id
     where s.session_token = $1
       and s.revoked_at is null
     limit 1`,
    [token],
  ).catch(() => null);

  if (!data) {
    return getLegacyTeamSessionFromToken(token);
  }

  if (!data || !data.is_active) return null;
  if (data.session_expires_at && new Date(data.session_expires_at) < new Date()) {
    await glashQuery(
      "update public.team_device_sessions set revoked_at = now(), revoke_reason = 'expired' where session_token = $1",
      [token],
    ).catch(() => []);
    return null;
  }

  await glashQuery(
    "update public.team_device_sessions set last_seen_at = now() where session_token = $1",
    [token],
  ).catch(() => []);

  return {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
    username: data.username,
    avatar_url: data.avatar_url,
    role_title: data.role_title,
    department: data.department,
    is_sub_admin: !!data.is_sub_admin,
    permissions: data.permissions || [],
    language: data.language ?? "en",
    device_type: data.device_type || undefined,
  };
}

async function getLegacyTeamSessionFromToken(token: string): Promise<TeamSession | null> {
  const data = await glashMaybeOne<{
    id: string;
    full_name: string;
    email: string;
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
    `select id, full_name, email, username, avatar_url, role_title, department,
      is_sub_admin, permissions, language, session_expires_at, is_active
     from public.team_members
     where session_token = $1
     limit 1`,
    [token],
  ).catch(() => null);

  if (!data || !data.is_active) return null;
  if (data.session_expires_at && new Date(data.session_expires_at) < new Date()) {
    await glashQuery("update public.team_members set session_token = null where id = $1", [data.id]).catch(() => []);
    return null;
  }

  return {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
    username: data.username,
    avatar_url: data.avatar_url,
    role_title: data.role_title,
    department: data.department,
    is_sub_admin: !!data.is_sub_admin,
    permissions: data.permissions || [],
    language: data.language ?? "en",
  };
}

/** Server-only: read the currently logged-in team member from the session cookie. */
export async function getTeamSession(): Promise<TeamSession | null> {
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
