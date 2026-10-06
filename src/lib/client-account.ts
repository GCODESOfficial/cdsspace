import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/glashdb/server";
import { loadLegalDocument } from "@/lib/legal/server";
import { readClientDashboardSessionUser } from "@/lib/client-dashboard-session";
import type { ClientBillingCurrency } from "@/lib/client-billing";
import { acceptClientAccountInvite } from "@/lib/client-directory-server";
import { notifyAdminOfNewClient } from "@/lib/client-signup-notification";

export const CLIENT_AGREEMENT_TEXT =
  "I confirm that I have read and agree to the CDS Space Terms of Service and Privacy Policy.";

export interface ClientProfile {
  id: string;
  public_user_id: string;
  email: string;
  email_verified_at: string | null;
  full_name: string | null;
  company_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  billing_currency: ClientBillingCurrency | null;
  billing_currency_selected_at: string | null;
  created_at: string | null;
  account_status: "active" | "closed" | "suspended";
  closed_at: string | null;
}

export interface ClientAgreement {
  id: string;
  user_id: string;
  user_email: string;
  user_full_name: string | null;
  company_name: string | null;
  terms_version: number;
  terms_effective_date: string | null;
  privacy_version: number;
  privacy_effective_date: string | null;
  agreement_text: string;
  signed_at: string;
}

export interface ClientAccountState {
  user: User;
  profile: ClientProfile;
  agreement: ClientAgreement | null;
}

export function safeClientPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;
  if (
    value.startsWith("/login") ||
    value.startsWith("/signup") ||
    value.startsWith("/agreement") ||
    value.startsWith("/onboarding")
  ) {
    return fallback;
  }
  return value;
}

/**
 * Whether the address was verified by someone other than GlashDB.
 *
 * GlashDB now confirms password accounts the moment they are created, so its
 * email_confirmed_at proves nothing for them: only the CDS Space verification
 * link can set email_verified_at on a password account. Google and LinkedIn
 * verify the address themselves, so their confirmation still counts.
 */
export function isPasswordAccount(user: User) {
  const provider = String(user.app_metadata?.provider || "").toLowerCase();
  return provider === "email" || provider === "";
}

function userProfilePayload(user: User) {
  const emailVerifiedAt = isPasswordAccount(user)
    ? null
    : user.email_confirmed_at || user.confirmed_at || null;
  if (!user.email) {
    throw new Error("Verify your email address before activating your CDS Space account.");
  }
  return {
    id: user.id,
    email: user.email,
    email_verified_at: emailVerifiedAt,
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    company_name: user.user_metadata?.company_name || null,
    phone_number: user.user_metadata?.phone_number || null,
    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    updated_at: new Date().toISOString(),
  };
}

export function fallbackPublicUserId(userId: string) {
  const compact = userId.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return (compact.slice(0, 8) || "CLIENT00").padEnd(8, "0");
}

function isTransientClientProfileError(error: unknown) {
  return /connection.*(timeout|terminated)|timed out|econnreset|network/i.test(
    String((error as { message?: string } | null)?.message || error || ""),
  );
}

export async function ensureClientProfile(user: User): Promise<ClientProfile> {
  // The Glash query client intentionally has a compatibility shape, so keep
  // the server-only boundary explicit here instead of leaking `any` to callers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any;
  const payload = userProfilePayload(user);

  const loadProfile = () => db
      .from("profiles")
      .select("id, public_user_id, email, email_verified_at, full_name, company_name, phone_number, avatar_url, billing_currency, billing_currency_selected_at, created_at, account_status, closed_at")
      .eq("id", user.id)
      .maybeSingle();
  let profileResult = await loadProfile();
  if (isTransientClientProfileError(profileResult.error)) profileResult = await loadProfile();
  let { data: existing, error: profileError } = profileResult;

  // Keep login readable during a safe code-first deployment. Until the
  // billing-currency migration is applied, the user is treated as not yet
  // onboarded and will be sent to the currency step.
  if (profileError && /(billing_currency|public_user_id|email_verified_at)/i.test(String(profileError.message || profileError))) {
    const missingColumnMessage = String(profileError.message || profileError);
    const fallbackColumns = /public_user_id/i.test(missingColumnMessage) && !/billing_currency/i.test(missingColumnMessage)
      ? "id, email, full_name, company_name, phone_number, avatar_url, billing_currency, billing_currency_selected_at, created_at"
      : "id, email, full_name, company_name, phone_number, avatar_url, created_at";
    const fallback = await db
      .from("profiles")
      .select(fallbackColumns)
      .eq("id", user.id)
      .maybeSingle();
    existing = fallback.data ? {
      ...fallback.data,
      public_user_id: fallbackPublicUserId(user.id),
      billing_currency: fallback.data.billing_currency || null,
      billing_currency_selected_at: fallback.data.billing_currency_selected_at || null,
      email_verified_at: payload.email_verified_at,
    } : null;
    profileError = fallback.error;
  }

  if (profileError) throw new Error(profileError.message || "Could not load the client profile.");

  if (existing) {
    const metadataPatch: Record<string, string> = {};
    const restoredFromDashboardSession = user.user_metadata?.dashboard_audience === "client";
    if (!existing.email && payload.email) metadataPatch.email = payload.email;
    if (!existing.avatar_url && payload.avatar_url) metadataPatch.avatar_url = payload.avatar_url;
    // Only ever fills a missing verification, and only from a provider that
    // verifies addresses. It used to copy GlashDB's value on every load, which
    // would have marked unverified password accounts verified.
    if (!restoredFromDashboardSession && !existing.email_verified_at && payload.email_verified_at) {
      metadataPatch.email_verified_at = payload.email_verified_at;
    }
    if (Object.keys(metadataPatch).length) {
      await db.from("profiles").update({ ...metadataPatch, updated_at: payload.updated_at }).eq("id", user.id);
    }
    const profile = {
      id: existing.id,
      public_user_id: existing.public_user_id || fallbackPublicUserId(user.id),
      email: existing.email || payload.email,
      email_verified_at: existing.email_verified_at || payload.email_verified_at,
      full_name: existing.full_name || payload.full_name,
      company_name: existing.company_name || payload.company_name,
      phone_number: existing.phone_number || payload.phone_number,
      avatar_url: existing.avatar_url || payload.avatar_url,
      billing_currency: existing.billing_currency || null,
      billing_currency_selected_at: existing.billing_currency_selected_at || null,
      created_at: existing.created_at || null,
      account_status: existing.account_status || "active",
      closed_at: existing.closed_at || null,
    };
    await acceptClientAccountInvite({
      inviteId: user.user_metadata?.client_invite_id,
      platformUserId: profile.id,
      email: profile.email,
    });
    const createdAt = profile.created_at ? new Date(profile.created_at).getTime() : 0;
    if (createdAt && Date.now() - createdAt <= 24 * 60 * 60 * 1000) {
      // Not awaited: this runs on every account read for a day after signup and
      // mustn't hold up the client's request (it skips when already sent).
      void notifyAdminOfNewClient(profile).catch((notificationError) => {
        console.error("[client-signup] admin notification failed", notificationError);
      });
    }
    return profile;
  }

  const { data, error } = await db.from("profiles").insert(payload).select("*").single();
  if (error || !data) throw new Error(error?.message || "Could not create the client profile.");
  const profile = {
    ...(data as ClientProfile),
    public_user_id: (data as ClientProfile).public_user_id || fallbackPublicUserId(user.id),
  };
  await acceptClientAccountInvite({
    inviteId: user.user_metadata?.client_invite_id,
    platformUserId: profile.id,
    email: profile.email,
  });
  await notifyAdminOfNewClient(profile).catch((notificationError) => {
    console.error("[client-signup] admin notification failed", notificationError);
  });
  return profile;
}

/**
 * A schema fault is a real answer; a timeout or dropped connection is not.
 * Treating the second as "this account does not exist" is what turned a
 * passing database hiccup into a client being signed out or shown a 500.
 */
function isTransientAccountError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code || "");
  return !["42P01", "42703", "42883", "22P02"].includes(code);
}

export type ClientAccountLoad =
  | { status: "ok"; state: ClientAccountState }
  | { status: "signed_out" }
  | { status: "unavailable" };

/**
 * The dashboard entry point. Distinguishes "not signed in" from "we could not
 * reach the database just now", so an outage no longer logs a client out.
 */
export async function loadClientAccountState(attempts = 3): Promise<ClientAccountLoad> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const state = await getClientAccountState();
      return state ? { status: "ok", state } : { status: "signed_out" };
    } catch (error) {
      lastError = error;
      if (!isTransientAccountError(error) || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  console.error("[client-account] account state unavailable", lastError);
  return { status: "unavailable" };
}

export async function getClientAccountState(): Promise<ClientAccountState | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any;
  const user = await readClientDashboardSessionUser();
  if (!user) return null;

  // Both need only the user, so they are read together rather than one after
  // the other. Every client page, the dashboard layout and CREATE included,
  // waits on this.
  const [profile, agreementResult] = await Promise.all([
    ensureClientProfile(user),
    db.from("user_legal_agreements").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profile.account_status !== "active") return null;
  // No verified address, no dashboard. Every active client already has one.
  if (!profile.email_verified_at) return null;
  const agreement = agreementResult?.data;

  return { user, profile, agreement: (agreement as ClientAgreement | null) ?? null };
}

export async function getCurrentLegalAgreementDocuments() {
  const [terms, privacy] = await Promise.all([
    loadLegalDocument("terms"),
    loadLegalDocument("privacy"),
  ]);
  return { terms, privacy };
}
