import "server-only";

import type { User } from "@supabase/supabase-js";
import { getGlashDbServiceRoleConfig } from "@/lib/glashdb/env";
import {
  createDashboardSessionToken,
  DEFAULT_DASHBOARD_SESSION_LIFETIME_SECONDS,
  verifyDashboardSessionToken,
} from "@/lib/dashboard-session-core.mjs";

export type DashboardAudience = "client" | "marketer";

export interface DashboardSessionClaims {
  purpose: "cds-dashboard-session";
  version: 1;
  audience: DashboardAudience;
  subject: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

export const DASHBOARD_SESSION_LIFETIME_SECONDS = DEFAULT_DASHBOARD_SESSION_LIFETIME_SECONDS;

function signingSecret() {
  return getGlashDbServiceRoleConfig().serviceRoleKey;
}

export function createFirstPartyDashboardSession(
  audience: DashboardAudience,
  user: { id: string; email?: string | null },
) {
  return createDashboardSessionToken({
    secret: signingSecret(),
    audience,
    subject: user.id,
    email: user.email || "",
    lifetimeSeconds: DASHBOARD_SESSION_LIFETIME_SECONDS,
  });
}

export function verifyFirstPartyDashboardSession(token: unknown, audience: DashboardAudience) {
  return verifyDashboardSessionToken(token, {
    secret: signingSecret(),
    audience,
    maxLifetimeSeconds: DASHBOARD_SESSION_LIFETIME_SECONDS,
  }) as DashboardSessionClaims | null;
}

export function dashboardSessionUser(claims: DashboardSessionClaims): User {
  const verifiedAt = new Date(claims.issuedAt * 1000).toISOString();
  return {
    id: claims.subject,
    email: claims.email,
    email_confirmed_at: verifiedAt,
    confirmed_at: verifiedAt,
    user_metadata: { dashboard_audience: claims.audience },
    app_metadata: {},
    aud: "authenticated",
    role: "authenticated",
    created_at: verifiedAt,
  } as User;
}

export function dashboardSessionCookieOptions(maxAge = DASHBOARD_SESSION_LIFETIME_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

