import { verifyAppleIdentityToken } from "@/lib/auth/apple-identity";
import { prepareDirectOAuthUser } from "@/lib/auth/direct-oauth-user";
import {
  connectProviderToClient,
  findLinkedClientIdentity,
  loadClientProfileIdentity,
} from "@/lib/auth/client-account-connections";
import { finalizeClientOAuthSignIn } from "@/lib/client-oauth";
import { issueClientMobileSession, readClientMobileSession } from "@/lib/client-mobile-session";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign in with Apple from the iPhone app (App Store guideline 4.8: an app that
 * offers Google sign-in must also offer Sign in with Apple).
 * Body: { identityToken, rawNonce, fullName?, platform?, link? }
 * - Sign-in: the verified Apple ID resolves to its connected client, or to the
 *   account for the email Apple verified (created if new), then goes through the
 *   same checks as Google and returns a device token.
 * - link: true with the app's Bearer token connects this Apple ID to the signed-in
 *   client (Account Config), like connecting Google.
 */
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  let apple;
  try {
    apple = await verifyAppleIdentityToken(body.identityToken, body.rawNonce);
  } catch (error) {
    console.error("[mobile-auth] Apple token rejected", error instanceof Error ? error.message : "Unknown error");
    return mobileJson({ error: "Apple sign-in could not be verified. Please try again." }, 401);
  }

  try {
    if (body.link === true) {
      const session = await readClientMobileSession();
      if (!session) return mobileJson({ error: "Unauthorized" }, 401);
      const connected = await connectProviderToClient({
        clientUserId: session.subject,
        provider: "apple",
        subject: apple.subject,
        email: apple.email,
      });
      if (!connected) return mobileJson({ error: "This Apple ID could not be connected. Please try again." }, 400);
      return mobileJson({ success: true });
    }

    // An Apple ID already connected to a client signs in to that client, even when
    // Apple hides the email (private relay) or omits it on later sign-ins.
    let email = apple.emailVerified ? apple.email : "";
    if (!email) {
      const linked = await findLinkedClientIdentity("apple", apple.subject);
      const client = linked ? await loadClientProfileIdentity(linked.client_user_id) : null;
      email = client?.email || "";
    }
    if (!email) {
      return mobileJson({
        error: "Apple did not share a verified email. Sign in with your email and password instead.",
      }, 400);
    }

    const user = await prepareDirectOAuthUser({
      provider: "apple",
      subject: apple.subject,
      email,
      name: str(body.fullName).trim().slice(0, 200),
      picture: "",
    });
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
      { id: payload.clientUserId, email: typeof payload.email === "string" ? payload.email : email },
      { platform: body.platform, deviceName: body.deviceName },
    );
    return mobileJson({ success: true, token: session.token, expiresAt: session.expiresAt });
  } catch (error) {
    console.error("[mobile-auth] Apple sign-in failed", error instanceof Error ? error.message : "Unknown error");
    return mobileJson({ error: "Apple sign-in failed. Please try again." }, 500);
  }
}
