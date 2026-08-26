'use server'

import { createClient } from "@/lib/glashdb/server";
import { ensureMarketerProfile } from "@/lib/marketer-account";
import { clearClientDashboardSessionCookie } from "@/lib/client-dashboard-session";
import {
  clearMarketerDashboardSessionCookie,
  setMarketerDashboardSessionCookie,
} from "@/lib/marketer-dashboard-session";
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from "@/lib/security/email-blocklist";

function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function marketerLogin(input: { email: string; password: string }) {
  if (isBlockedEmail(input.email)) return { error: BLOCKED_EMAIL_MESSAGE };
  const db = await createClient();
  const { data, error } = await db.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error || !data.user) return { error: error?.message || "Could not sign in." };
  const profile = await ensureMarketerProfile(data.user);
  if (profile.status === "suspended" || profile.status === "closed") {
    await db.auth.signOut({ scope: "global" }).catch(() => undefined);
    await clearMarketerDashboardSessionCookie();
    return { error: "This marketer account is not active." };
  }
  await Promise.all([
    setMarketerDashboardSessionCookie(data.user),
    clearClientDashboardSessionCookie(),
  ]);
  return { success: true, next: "/marketer" };
}

export async function marketerSignup(input: { email: string; password: string; fullName: string }) {
  if (isBlockedEmail(input.email)) return { error: BLOCKED_EMAIL_MESSAGE };
  const db = await createClient();
  const { data, error } = await db.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName, account_type: "brand_marketer" },
      emailRedirectTo: `${siteOrigin()}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  if (data.user && data.session) {
    const profile = await ensureMarketerProfile(data.user);
    if (profile.status === "suspended" || profile.status === "closed") {
      await db.auth.signOut({ scope: "global" }).catch(() => undefined);
      await clearMarketerDashboardSessionCookie();
      return { error: "This marketer account is not active." };
    }
    await Promise.all([
      setMarketerDashboardSessionCookie(data.user),
      clearClientDashboardSessionCookie(),
    ]);
    return { success: true, next: "/marketer" };
  }
  return { success: true, confirmationRequired: true };
}

export async function marketerLogout() {
  const db = await createClient();
  await db.auth.signOut();
  await clearMarketerDashboardSessionCookie();
  return { success: true };
}
