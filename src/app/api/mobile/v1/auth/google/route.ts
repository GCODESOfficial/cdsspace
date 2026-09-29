import { verifyGoogleIdToken } from "@/lib/auth/google-id-token";
import { prepareDirectOAuthUser } from "@/lib/auth/direct-oauth-user";
import { connectProviderToClient } from "@/lib/auth/client-account-connections";
import { finalizeClientOAuthSignIn } from "@/lib/client-oauth";
import { issueClientMobileSession, readClientMobileSession } from "@/lib/client-mobile-session";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { mobileJson, readMobileBody } from "@/lib/mobile-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Native Google sign-in from the app: Google's own account picker runs inside
 * the app and returns a signed ID token, which is verified here. The account
 * checks are the same as the web Google callback (blocklist, linked identities,
 * suspended/closed accounts), and the app gets a device session directly.
 *
 * { idToken, platform }             → { token, expiresAt }
 * { idToken, link: true } + Bearer  → connects this Google account to the signed-in client
 */
export async function POST(request: Request) {
  const body = await readMobileBody(request);

  let google;
  try {
    google = await verifyGoogleIdToken(body.idToken);
  } catch (error) {
    console.error("[mobile-auth] Google token rejected", error instanceof Error ? error.message : "Unknown error");
    return mobileJson({ error: "Google sign-in could not be verified. Please try again." }, 401);
  }

  try {
    const user = await prepareDirectOAuthUser({ provider: "google", ...google });

    if (body.link === true) {
      const session = await readClientMobileSession();
      if (!session) return mobileJson({ error: "Unauthorized" }, 401);
      const connected = await connectProviderToClient({
        clientUserId: session.subject,
        provider: "google",
        subject: google.subject,
        email: google.email,
      });
      if (!connected) return mobileJson({ error: "This Google account could not be connected. Please try again." }, 400);
      return mobileJson({ success: true });
    }

    const finalized = await finalizeClientOAuthSignIn({ auth: { signOut: async () => undefined }, user, next: null });
    const payload = await finalized.json().catch(() => ({})) as { ok?: unknown; clientUserId?: unknown; email?: unknown; error?: unknown };
    if (payload.ok !== true || typeof payload.clientUserId !== "string") {
      return mobileJson({
        error: typeof payload.error === "string" ? payload.error : "This account cannot sign in to the CDS Space client app.",
      }, 403);
    }

    const profile = await glashMaybeOne<{ account_status: string }>(
      "select account_status from public.profiles where id = $1::uuid limit 1",
      [payload.clientUserId],
    );
    if (profile?.account_status !== "active") {
      return mobileJson({ error: "This CDS Space business account is not active." }, 403);
    }

    const session = await issueClientMobileSession(
      { id: payload.clientUserId, email: typeof payload.email === "string" ? payload.email : google.email },
      { platform: body.platform, deviceName: body.deviceName },
    );
    return mobileJson({ success: true, token: session.token, expiresAt: session.expiresAt });
  } catch (error) {
    console.error("[mobile-auth] Native Google sign-in failed", error instanceof Error ? error.message : "Unknown error");
    return mobileJson({ error: "Google sign-in failed. Please try again." }, 500);
  }
}
