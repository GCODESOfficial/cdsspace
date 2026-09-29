import "server-only";

import { NextResponse } from "next/server";
import type { ClientAccountState } from "@/lib/client-account";
import { getClientModuleVisibility } from "@/lib/client-modules-server";

/**
 * Shared shapes for /api/mobile/v1. The mobile app never follows web paths:
 * instead of `next: "/<id>/dashboard"` it gets the onboarding step to show.
 */

export type ClientOnboardingStep = "agreement" | "currency" | "dashboard";

export function mobileJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function readMobileBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export const str = (value: unknown) => (typeof value === "string" ? value : "");

// Same order as the web dashboard layout: agreement first, then billing currency.
export function clientOnboardingStep(state: ClientAccountState): ClientOnboardingStep {
  if (!state.agreement) return "agreement";
  if (!state.profile.billing_currency) return "currency";
  return "dashboard";
}

export async function serializeClientMe(state: ClientAccountState) {
  const { profile, agreement } = state;
  return {
    user: {
      id: profile.id,
      publicId: profile.public_user_id,
      email: profile.email,
      fullName: profile.full_name,
      companyName: profile.company_name,
      phone: profile.phone_number,
      avatarUrl: profile.avatar_url,
      billingCurrency: profile.billing_currency,
      createdAt: profile.created_at,
    },
    agreement: agreement
      ? {
          signedAt: agreement.signed_at,
          termsVersion: agreement.terms_version,
          privacyVersion: agreement.privacy_version,
        }
      : null,
    next: clientOnboardingStep(state),
    modules: await getClientModuleVisibility(profile.id),
  };
}
