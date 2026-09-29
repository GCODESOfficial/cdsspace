import "server-only";

import { headers } from "next/headers";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import type { DashboardSessionClaims } from "@/lib/dashboard-session";
import {
  MOBILE_SESSION_TOUCH_SECONDS,
  createMobileSessionToken,
  hashMobileSessionToken,
  normalizePlatform,
  parseMobileBearer,
  slidingExpiry,
} from "@/lib/client-mobile-session-core.mjs";

/**
 * Client sessions for the mobile app. The app sends "Authorization: Bearer
 * cdsm1.…"; each token maps to a row in public.client_mobile_sessions (stored
 * as a hash) so sign-out, password resets and account closure can revoke it.
 * A verified token yields the same claims as the web dashboard cookie, so every
 * route that reads the client session accepts either.
 */

type MobileSessionRow = {
  id: string;
  user_id: string;
  email: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
};

export async function issueClientMobileSession(
  user: { id: string; email?: string | null },
  device: { platform?: unknown; deviceName?: unknown } = {},
) {
  const token = createMobileSessionToken();
  const now = Date.now();
  const expiresAt = slidingExpiry(now, now);
  await glashQuery(
    `insert into public.client_mobile_sessions (user_id, email, token_hash, platform, device_name, expires_at)
     values ($1::uuid, $2, $3, $4, $5, $6)`,
    [
      user.id,
      String(user.email || "").slice(0, 320),
      hashMobileSessionToken(token),
      normalizePlatform(device.platform),
      typeof device.deviceName === "string" ? device.deviceName.slice(0, 120) : null,
      expiresAt.toISOString(),
    ],
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

async function findActiveSession(token: string) {
  return glashMaybeOne<MobileSessionRow>(
    `select id, user_id, email, created_at, last_used_at, expires_at
       from public.client_mobile_sessions
      where token_hash = $1 and revoked_at is null and expires_at > now()
      limit 1`,
    [hashMobileSessionToken(token)],
  );
}

export async function verifyClientMobileSession(token: string): Promise<DashboardSessionClaims | null> {
  const row = await findActiveSession(token).catch(() => null);
  if (!row) return null;

  const now = Date.now();
  if (now - Date.parse(row.last_used_at) > MOBILE_SESSION_TOUCH_SECONDS * 1000) {
    const expiresAt = slidingExpiry(Date.parse(row.created_at), now);
    await glashQuery(
      "update public.client_mobile_sessions set last_used_at = now(), expires_at = $2 where id = $1::uuid",
      [row.id, expiresAt.toISOString()],
    ).catch(() => undefined);
  }

  return {
    purpose: "cds-dashboard-session",
    version: 1,
    audience: "client",
    subject: row.user_id,
    email: row.email,
    issuedAt: Math.floor(Date.parse(row.created_at) / 1000),
    expiresAt: Math.floor(Date.parse(row.expires_at) / 1000),
  };
}

/** The mobile token on the current request, if any. */
export async function readRequestMobileToken() {
  const requestHeaders = await headers();
  return parseMobileBearer(requestHeaders.get("authorization"));
}

export async function readClientMobileSession() {
  const token = await readRequestMobileToken();
  return token ? verifyClientMobileSession(token) : null;
}

export async function revokeClientMobileSession(token: string, reason = "logout") {
  await glashQuery(
    "update public.client_mobile_sessions set revoked_at = now(), revoke_reason = $2 where token_hash = $1 and revoked_at is null",
    [hashMobileSessionToken(token), reason],
  );
}

/**
 * Sign devices out, e.g. after a password change, reset or account closure.
 * exceptToken keeps the device that made the change signed in.
 */
export async function revokeAllClientMobileSessions(userId: string, reason: string, exceptToken?: string | null) {
  await glashQuery(
    `update public.client_mobile_sessions set revoked_at = now(), revoke_reason = $2
      where user_id = $1::uuid and revoked_at is null and ($3::text is null or token_hash <> $3)`,
    [userId, reason, exceptToken ? hashMobileSessionToken(exceptToken) : null],
  );
}
