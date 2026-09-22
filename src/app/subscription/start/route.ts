import { NextRequest, NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { clientDashboardPath } from "@/lib/client-routes";
import { absoluteApplicationUrl } from "@/lib/public-site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUBSCRIPTION_DESTINATION = "/dashboard/subscription";

function redirectNoStore(request: NextRequest, pathname: string) {
  const response = NextResponse.redirect(absoluteApplicationUrl(pathname, request));
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

/**
 * One durable entry point for every public subscription CTA.
 *
 * The destination stays unscoped until the authenticated account resolves its
 * stable public user ID. Login, agreement and onboarding already preserve the
 * `next` value and scope it after setup is complete.
 */
export async function GET(request: NextRequest) {
  const account = await getClientAccountState();
  if (!account) {
    return redirectNoStore(request, `/login?next=${encodeURIComponent(SUBSCRIPTION_DESTINATION)}`);
  }
  if (!account.agreement) {
    return redirectNoStore(request, `/agreement?next=${encodeURIComponent(SUBSCRIPTION_DESTINATION)}`);
  }
  if (!account.profile.billing_currency) {
    return redirectNoStore(request, `/onboarding?next=${encodeURIComponent(SUBSCRIPTION_DESTINATION)}`);
  }
  return redirectNoStore(
    request,
    clientDashboardPath(account.profile.public_user_id, SUBSCRIPTION_DESTINATION),
  );
}
