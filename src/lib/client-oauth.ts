import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { ensureClientProfile, safeClientPath } from "@/lib/client-account";
import {
  clearClientDashboardSessionOnResponse,
  setClientDashboardSessionOnResponse,
} from "@/lib/client-dashboard-session";
import {
  clearMarketerDashboardSessionOnResponse,
  setMarketerDashboardSessionOnResponse,
} from "@/lib/marketer-dashboard-session";
import { clientDashboardPath } from "@/lib/client-routes";
import { deliverClientWelcome } from "@/lib/client-welcome";
import { ensureMarketerProfile } from "@/lib/marketer-account";
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from "@/lib/security/email-blocklist";
import {
  findLinkedClientIdentity,
  loadClientProfileIdentity,
  oauthProviderForUser,
  providerEmail,
  providerSubject,
  recordProviderLogin,
} from "@/lib/auth/client-account-connections";

type OAuthAuthClient = {
  signOut: (options?: { scope?: "global" | "local" | "others" }) => Promise<unknown>;
};

function userForLinkedClient(user: User, client: { id: string; email: string; email_verified_at: string | null }): User {
  const verifiedAt = client.email_verified_at || user.email_confirmed_at || user.confirmed_at || new Date().toISOString();
  return {
    ...user,
    id: client.id,
    email: client.email,
    email_confirmed_at: verifiedAt,
    confirmed_at: verifiedAt,
  } as User;
}

export async function finalizeClientOAuthSignIn(input: {
  auth: OAuthAuthClient;
  user: User;
  next?: string | null;
}) {
  // OAuth bypasses the email/password forms entirely, so the blocklist has to
  // be enforced here too - otherwise "Continue with Google" is an open door.
  if (isBlockedEmail(input.user.email)) {
    await input.auth.signOut({ scope: "global" }).catch(() => undefined);
    return clearMarketerDashboardSessionOnResponse(clearClientDashboardSessionOnResponse(
      NextResponse.json(
        { ok: false, next: "/login?account=blocked", error: BLOCKED_EMAIL_MESSAGE },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    ));
  }

  // Marketer intent arrives one of two ways: the account was created through
  // the marketer signup form (which stamps the metadata), or the visitor used
  // social sign-in from the marketer portal, which carries /marketer as the
  // destination. OAuth providers do not set our account_type metadata, so the
  // destination must also participate in portal routing.
  const wantsMarketerPortal = typeof input.next === "string"
    && (input.next === "/marketer" || input.next.startsWith("/marketer/"));

  if (input.user.user_metadata?.account_type === "brand_marketer" || wantsMarketerPortal) {
    const marketer = await ensureMarketerProfile(input.user);
    if (marketer.status === "suspended" || marketer.status === "closed") {
      await input.auth.signOut({ scope: "global" }).catch(() => undefined);
      return clearClientDashboardSessionOnResponse(clearMarketerDashboardSessionOnResponse(
        NextResponse.json(
          { ok: false, next: "/marketer/login?account=inactive" },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        ),
      ));
    }
    return clearClientDashboardSessionOnResponse(setMarketerDashboardSessionOnResponse(
      NextResponse.json({ ok: true, next: "/marketer", email: input.user.email || "" }, { headers: { "Cache-Control": "no-store" } }),
      input.user,
    ));
  }

  const provider = oauthProviderForUser(input.user);
  const subject = provider ? providerSubject(input.user, provider) : "";
  const socialEmail = provider ? providerEmail(input.user, provider) : "";
  let dashboardUser = input.user;

  // A provider identity explicitly connected in Account Config always resolves
  // to that stable client user ID, even when Google and LinkedIn use different
  // email addresses. Unconnected provider identities keep their own profiles.
  if (provider && subject) {
    const linked = await findLinkedClientIdentity(provider, subject);
    if (linked) {
      const client = await loadClientProfileIdentity(linked.client_user_id);
      if (client) dashboardUser = userForLinkedClient(input.user, client);
    }
  }

  let profile = await ensureClientProfile(dashboardUser);
  if (provider && subject) {
    const recorded = await recordProviderLogin({
      clientUserId: profile.id,
      provider,
      subject,
      email: socialEmail,
    });
    // Resolve a rare concurrent first-login race in favour of the identity
    // mapping that won the unique provider-subject constraint.
    if (recorded && recorded.client_user_id !== profile.id) {
      const client = await loadClientProfileIdentity(recorded.client_user_id);
      if (client) {
        dashboardUser = userForLinkedClient(input.user, client);
        profile = await ensureClientProfile(dashboardUser);
      }
    }
  }
  if (profile.account_status !== "active") {
    await input.auth.signOut({ scope: "global" }).catch(() => undefined);
    const accountState = profile.account_status === "suspended" ? "suspended" : "closed";
    return clearClientDashboardSessionOnResponse(
      NextResponse.json(
        { ok: false, next: `/login?account=${accountState}` },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    );
  }

  await deliverClientWelcome(profile.id).catch((error) => {
    console.error("[client-welcome] OAuth delivery failed", error);
  });

  return clearMarketerDashboardSessionOnResponse(setClientDashboardSessionOnResponse(
    NextResponse.json(
      // The address comes back so the browser can remember which account and
      // which provider was used, for the hint on the sign-in page.
      { ok: true, next: clientDashboardPath(profile.public_user_id, safeClientPath(input.next)), email: profile.email || "" },
      { headers: { "Cache-Control": "no-store" } },
    ),
    dashboardUser,
  ));
}
