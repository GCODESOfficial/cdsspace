import "server-only";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  createFirstPartyDashboardSession,
  dashboardSessionCookieOptions,
  dashboardSessionUser,
  verifyFirstPartyDashboardSession,
} from "@/lib/dashboard-session";
import { createClient } from "@/lib/glashdb/server";
import { getVerifiedAuthUser } from "@/lib/glashdb/auth-user";

export const MARKETER_DASHBOARD_SESSION_COOKIE = "cds_marketer_dashboard";

export function createMarketerDashboardSession(user: { id: string; email?: string | null }) {
  return createFirstPartyDashboardSession("marketer", user);
}

export function verifyMarketerDashboardSession(token: unknown) {
  return verifyFirstPartyDashboardSession(token, "marketer");
}

export async function readMarketerDashboardSessionUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authClient?: any,
): Promise<User | null> {
  const store = await cookies();
  const claims = verifyMarketerDashboardSession(store.get(MARKETER_DASHBOARD_SESSION_COOKIE)?.value);
  if (claims) return dashboardSessionUser(claims);

  // Compatibility bridge for provider-only sessions created by older builds.
  // New logins always receive the first-party cookie below.
  const auth = authClient || (await createClient()).auth;
  const providerUser = await getVerifiedAuthUser(auth);
  return providerUser?.user_metadata?.account_type === "brand_marketer" ? providerUser : null;
}

export async function setMarketerDashboardSessionCookie(user: { id: string; email?: string | null }) {
  const store = await cookies();
  store.set(
    MARKETER_DASHBOARD_SESSION_COOKIE,
    createMarketerDashboardSession(user),
    dashboardSessionCookieOptions(),
  );
}

export async function clearMarketerDashboardSessionCookie() {
  const store = await cookies();
  store.set(MARKETER_DASHBOARD_SESSION_COOKIE, "", dashboardSessionCookieOptions(0));
}

export function setMarketerDashboardSessionOnResponse(
  response: NextResponse,
  user: { id: string; email?: string | null },
) {
  response.cookies.set(
    MARKETER_DASHBOARD_SESSION_COOKIE,
    createMarketerDashboardSession(user),
    dashboardSessionCookieOptions(),
  );
  return response;
}

export function clearMarketerDashboardSessionOnResponse(response: NextResponse) {
  response.cookies.set(MARKETER_DASHBOARD_SESSION_COOKIE, "", dashboardSessionCookieOptions(0));
  return response;
}

