import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getGlashDbServiceRoleConfig } from "@/lib/glashdb/env";
import {
  createFirstPartyDashboardSession,
  dashboardSessionCookieOptions,
  dashboardSessionUser,
  type DashboardSessionClaims,
  verifyFirstPartyDashboardSession,
} from "@/lib/dashboard-session";

export const CLIENT_DASHBOARD_SESSION_COOKIE = "cds_client_dashboard";
const PURPOSE = "client-dashboard-session";
const SESSION_LIFETIME_SECONDS = 14 * 24 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClientDashboardSessionClaims = DashboardSessionClaims;

function signingSecret() {
  return getGlashDbServiceRoleConfig().serviceRoleKey;
}

function sign(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export function createClientDashboardSession(user: { id: string; email?: string | null }) {
  return createFirstPartyDashboardSession("client", user);
}

export function verifyClientDashboardSession(token: unknown): ClientDashboardSessionClaims | null {
  const current = verifyFirstPartyDashboardSession(token, "client");
  if (current) return current;

  // Preserve sessions issued before the shared dashboard-session contract was
  // introduced. They remain subject-bound, signed, and expiry checked.
  if (typeof token !== "string" || token.length > 4096) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expected = Buffer.from(sign(payload));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      purpose: string;
      version: number;
      subject: string;
      email: string;
      issuedAt: number;
      expiresAt: number;
    };
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.purpose !== PURPOSE ||
      claims.version !== 1 ||
      !UUID_PATTERN.test(claims.subject) ||
      typeof claims.email !== "string" ||
      claims.email.length > 320 ||
      !Number.isInteger(claims.issuedAt) ||
      !Number.isInteger(claims.expiresAt) ||
      claims.issuedAt > now + 60 ||
      claims.expiresAt <= now ||
      claims.expiresAt - claims.issuedAt !== SESSION_LIFETIME_SECONDS
    ) {
      return null;
    }
    return {
      purpose: "cds-dashboard-session",
      version: 1,
      audience: "client",
      subject: claims.subject,
      email: claims.email,
      issuedAt: claims.issuedAt,
      expiresAt: claims.expiresAt,
    };
  } catch {
    return null;
  }
}

export function clientDashboardSessionUser(claims: ClientDashboardSessionClaims): User {
  return dashboardSessionUser(claims);
}

export async function readClientDashboardSession() {
  const store = await cookies();
  return verifyClientDashboardSession(store.get(CLIENT_DASHBOARD_SESSION_COOKIE)?.value);
}

export async function readClientDashboardSessionUser(
  // Kept for source compatibility with older callers. Provider auth is no
  // longer consulted during dashboard navigation.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  _authClient?: any,
) {
  const claims = await readClientDashboardSession();
  return claims ? clientDashboardSessionUser(claims) : null;
}

export async function setClientDashboardSessionCookie(user: { id: string; email?: string | null }) {
  const store = await cookies();
  store.set(CLIENT_DASHBOARD_SESSION_COOKIE, createClientDashboardSession(user), dashboardSessionCookieOptions());
}

export async function clearClientDashboardSessionCookie() {
  const store = await cookies();
  store.set(CLIENT_DASHBOARD_SESSION_COOKIE, "", dashboardSessionCookieOptions(0));
}

export function setClientDashboardSessionOnResponse(
  response: NextResponse,
  user: { id: string; email?: string | null },
) {
  response.cookies.set(CLIENT_DASHBOARD_SESSION_COOKIE, createClientDashboardSession(user), dashboardSessionCookieOptions());
  return response;
}

export function clearClientDashboardSessionOnResponse(response: NextResponse) {
  response.cookies.set(CLIENT_DASHBOARD_SESSION_COOKIE, "", dashboardSessionCookieOptions(0));
  return response;
}
