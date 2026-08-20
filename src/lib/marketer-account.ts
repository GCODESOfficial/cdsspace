import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/glashdb/server";
import { readMarketerDashboardSessionUser } from "@/lib/marketer-dashboard-session";
import { loadLegalDocument } from "@/lib/legal/server";
import type { ClientBillingCurrency } from "@/lib/client-billing";

export const MARKETER_AGREEMENT_TEXT =
  "I confirm that I have read and agree to the CDS Space Terms of Service, Privacy Policy and Brand Marketer Agreement.";

export interface MarketerProfile {
  user_id: string;
  public_id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  phone_number: string | null;
  profile_photo_url: string | null;
  marketer_code: string | null;
  country: string | null;
  address: string | null;
  city: string | null;
  billing_currency: ClientBillingCurrency | null;
  billing_currency_selected_at: string | null;
  status: "onboarding" | "active" | "suspended" | "closed";
  profile_completed_at: string | null;
}

export interface MarketerAgreement {
  id: string;
  marketer_user_id: string;
  signer_name: string;
  signer_email: string;
  terms_version: number;
  privacy_version: number;
  marketer_agreement_version: number;
  signed_at: string;
}

export interface MarketerPayoutAccount {
  id: string;
  account_type: "bank" | "mobile_money";
  account_name: string;
  bank_name: string;
  account_number: string;
  bank_code: string | null;
  country: string | null;
  currency: ClientBillingCurrency;
  verified_at: string | null;
}

export interface MarketerAccountState {
  user: User;
  profile: MarketerProfile;
  agreement: MarketerAgreement | null;
  payoutAccount: MarketerPayoutAccount | null;
}

function userPayload(user: User) {
  return {
    user_id: user.id,
    email: user.email || "",
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    phone_number: user.user_metadata?.phone_number || null,
    profile_photo_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    updated_at: new Date().toISOString(),
  };
}

export async function ensureMarketerProfile(user: User): Promise<MarketerProfile> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any;
  const { data: existing, error: readError } = await db
    .from("brand_marketers")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) {
    throw new Error(`Could not load the marketer account. Run 20260804_brand_marketer_portal.sql first. ${readError.message || ""}`.trim());
  }
  if (existing) return existing as MarketerProfile;

  const { data, error } = await db.from("brand_marketers").insert(userPayload(user)).select("*").single();
  if (error || !data) throw new Error(error?.message || "Could not create the marketer account.");
  return data as MarketerProfile;
}

export async function getMarketerAccountState(): Promise<MarketerAccountState | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any;
  const user = await readMarketerDashboardSessionUser(db.auth);
  if (!user) return null;
  const profile = await ensureMarketerProfile(user);
  if (profile.status === "suspended" || profile.status === "closed") return null;
  const [{ data: agreement }, { data: payoutAccount }] = await Promise.all([
    db.from("brand_marketer_agreements").select("*").eq("marketer_user_id", user.id).maybeSingle(),
    db.from("brand_marketer_payout_accounts").select("*").eq("marketer_user_id", user.id).maybeSingle(),
  ]);
  return {
    user,
    profile,
    agreement: (agreement as MarketerAgreement | null) || null,
    payoutAccount: (payoutAccount as MarketerPayoutAccount | null) || null,
  };
}

export async function getCurrentMarketerLegalDocuments() {
  const [terms, privacy, marketerAgreement] = await Promise.all([
    loadLegalDocument("terms"),
    loadLegalDocument("privacy"),
    loadLegalDocument("brand-marketer-agreement"),
  ]);
  return { terms, privacy, marketerAgreement };
}

export function marketerProfileComplete(profile: MarketerProfile) {
  return Boolean(profile.full_name && profile.phone_number && profile.country && profile.marketer_code);
}
