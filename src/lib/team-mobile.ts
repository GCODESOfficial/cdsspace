import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { securityHash } from "@/lib/client-login-security";

/**
 * Team portal access for the mobile app.
 *
 * Before the team sign-in form is shown, the app asks for a one-time code sent
 * to the member's team email. The challenge and the resulting access token are
 * sealed (AES-256-GCM) and carried by the app, so no table is needed and the app
 * cannot read whether an address belongs to a team member: a challenge for an
 * unknown address looks identical and simply never verifies. Attempts and sends
 * are limited with public.security_rate_limits.
 */

export const TEAM_ACCESS_CODE_TTL_SECONDS = 15 * 60;
export const TEAM_ACCESS_RESEND_SECONDS = 60;
export const TEAM_ACCESS_MAX_ATTEMPTS = 5;
export const TEAM_ACCESS_TOKEN_TTL_SECONDS = 30 * 60;

type ChallengePayload = { v: 1; k: "team-access-challenge"; m: string | null; h: string; n: string; exp: number };
type AccessPayload = { v: 1; k: "team-access-token"; m: string; exp: number };

function sealKey() {
  return createHash("sha256").update(securityHash("team-mobile-seal", "v1")).digest();
}

function seal(payload: object) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function unseal<T>(value: unknown): T | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", sealKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

const codeHash = (nonce: string, code: string) => securityHash("team-access-code", `${nonce}:${code}`);

function hexEqual(left: string, right: string) {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** A sealed challenge for `memberId` (null for an address that is not a team member). */
export function createTeamAccessChallenge(memberId: string | null, code: string) {
  const nonce = randomBytes(18).toString("base64url");
  const payload: ChallengePayload = {
    v: 1,
    k: "team-access-challenge",
    m: memberId,
    // An unknown address gets a hash of a random value, so nothing can match it.
    h: codeHash(nonce, memberId ? code : randomBytes(18).toString("hex")),
    n: nonce,
    exp: Date.now() + TEAM_ACCESS_CODE_TTL_SECONDS * 1000,
  };
  return seal(payload);
}

export function openTeamAccessChallenge(challengeId: unknown) {
  const payload = unseal<ChallengePayload>(challengeId);
  return payload?.v === 1 && payload.k === "team-access-challenge" ? payload : null;
}

export function teamAccessCodeMatches(challenge: ChallengePayload, code: string) {
  return Boolean(challenge.m) && hexEqual(challenge.h, codeHash(challenge.n, code));
}

export function createTeamAccessToken(memberId: string) {
  const payload: AccessPayload = { v: 1, k: "team-access-token", m: memberId, exp: Date.now() + TEAM_ACCESS_TOKEN_TTL_SECONDS * 1000 };
  return seal(payload);
}

/** The member a still-valid access token was issued to, or null. */
export function teamAccessTokenMember(token: unknown) {
  const payload = unseal<AccessPayload>(token);
  if (payload?.v !== 1 || payload.k !== "team-access-token" || payload.exp < Date.now()) return null;
  return payload.m;
}

/**
 * The signed-in member in the shape the app keeps (camelCase, everything a
 * screen needs to decide what to show). signedInAt is when this device session
 * began, so the app can apply the same 18:15 Lagos cutoff the server enforces.
 */
export async function serializeTeamMember(memberId: string, sessionToken?: string | null) {
  const row = await glashMaybeOne<{
    id: string;
    username: string;
    email: string;
    email_verified_at: string | null;
    full_name: string;
    role_title: string | null;
    department: string | null;
    phone: string | null;
    location: string | null;
    bio: string | null;
    avatar_url: string | null;
    is_sub_admin: boolean;
    permissions: string[] | null;
    language: string | null;
    access_anywhere: boolean | null;
    work_mode: string | null;
    screening: boolean;
    session_created_at: string | null;
  }>(
    `select m.id, m.username, m.email, m.email_verified_at, m.full_name, m.role_title, m.department,
            m.phone, m.location, m.bio, m.avatar_url, m.is_sub_admin, m.permissions, m.language,
            m.access_anywhere, tp.work_mode,
            exists (select 1 from public.screening_role_setters s where s.team_member_id = m.id) as screening,
            (select s.created_at from public.team_device_sessions s
              where s.session_token = $2 and s.team_member_id = m.id limit 1) as session_created_at
       from public.team_members m
       left join public.team_time_profiles tp on tp.team_member_id = m.id
      where m.id = $1
      limit 1`,
    [memberId, sessionToken || ""],
  );
  if (!row) return null;

  // Admin access as the admin session computes it: the member's own permissions plus
  // their admin role's (the roles table may be missing in older environments).
  let adminPermissions: string[] = row.is_sub_admin ? row.permissions || [] : [];
  let adminRoleName: string | null = null;
  if (row.is_sub_admin) {
    const role = await glashMaybeOne<{ name: string | null; permissions: string[] | null }>(
      `select r.name, r.permissions
         from public.team_members m
         join public.admin_roles r on r.id = m.role_id
        where m.id = $1
        limit 1`,
      [memberId],
    ).catch(() => null);
    if (role) {
      adminRoleName = role.name ?? null;
      if (Array.isArray(role.permissions)) adminPermissions = Array.from(new Set([...role.permissions, ...adminPermissions]));
    }
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    fullName: row.full_name,
    roleTitle: row.role_title || "Team member",
    department: row.department,
    phone: row.phone || "",
    location: row.location || "",
    bio: row.bio || "",
    avatarUrl: row.avatar_url,
    isSubAdmin: !!row.is_sub_admin,
    adminPermissions,
    adminRoleName,
    hasScreeningAssignment: !!row.screening,
    workMode: row.work_mode || "onsite",
    accessAnywhere: !!row.access_anywhere,
    language: row.language || "en",
    signedInAt: row.session_created_at || new Date().toISOString(),
  };
}
