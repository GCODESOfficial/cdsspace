import { NextRequest, NextResponse } from "next/server";
import { completeClientEmailVerification, consumeClientEmailVerification } from "@/lib/client-email-verification";
import { publicSiteOrigin } from "@/lib/public-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNext(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

/**
 * Follows the fallback link in a sign-up email, for clients who open the email
 * on another device instead of typing the code. It does the same as the code:
 * the address is verified and the account confirmed. Invite acceptance and the
 * admin notification then run on first sign-in, as they always have.
 */
export async function GET(request: NextRequest) {
  const origin = publicSiteOrigin();
  const token = request.nextUrl.searchParams.get("token") || "";
  const spent = await consumeClientEmailVerification(token).catch(() => null);
  if (!spent) {
    return NextResponse.redirect(new URL("/login?error=verification_link_invalid", origin));
  }
  await completeClientEmailVerification(spent);
  const next = safeNext(spent.next_path);
  return NextResponse.redirect(new URL(`/login?verified=1&next=${encodeURIComponent(next)}`, origin));
}
