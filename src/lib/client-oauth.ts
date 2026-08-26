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

type OAuthAuthClient = {
  signOut: (options?: { scope?: "global" | "local" | "others" }) => Promise<unknown>;
};

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

  if (input.user.user_metadata?.account_type === "brand_marketer") {
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
      NextResponse.json({ ok: true, next: "/marketer" }, { headers: { "Cache-Control": "no-store" } }),
      input.user,
    ));
  }

  const profile = await ensureClientProfile(input.user);
  if (profile.account_status !== "active") {
    await input.auth.signOut({ scope: "global" }).catch(() => undefined);
    return clearClientDashboardSessionOnResponse(
      NextResponse.json(
        { ok: false, next: "/login?account=closed" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    );
  }

  await deliverClientWelcome(profile.id).catch((error) => {
    console.error("[client-welcome] OAuth delivery failed", error);
  });

  return clearMarketerDashboardSessionOnResponse(setClientDashboardSessionOnResponse(
    NextResponse.json(
      { ok: true, next: clientDashboardPath(profile.public_user_id, safeClientPath(input.next)) },
      { headers: { "Cache-Control": "no-store" } },
    ),
    input.user,
  ));
}
