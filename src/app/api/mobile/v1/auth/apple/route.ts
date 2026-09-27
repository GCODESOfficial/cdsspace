import { verifyAppleIdentityToken } from "@/lib/auth/apple-identity";
import { prepareDirectOAuthUser } from "@/lib/auth/direct-oauth-user";
import {
  connectProviderToClient,
  findLinkedClientIdentity,
  loadClientProfileIdentity,
} from "@/lib/auth/client-account-connections";
import { finalizeClientOAuthSignIn } from "@/lib/client-oauth";
import { issueClientMobileSession, readClientMobileSession } from "@/lib/client-mobile-session";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign in with Apple from the iPhone app.
 * Body: { identityToken, rawNonce, fullName?, platform?, link? }
 * - Sign-in: the verified Apple ID resolves to its connected client, or to the
 *   account for the email Apple verified (created if new), then goes through the
 *   same checks as Google/LinkedIn and returns a device token.
 * - link: true with the app's Bearer token connects this Apple ID to the signed-in
 *   client (Account Config), like connecting Google or LinkedIn on the web.
 */
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  let apple;
  try {
    apple = await verifyAppleIdentityToken(body.identityToken, body.rawNonce);
  } catch (error) {
    return mobileJson({ error: error instanceof Error ? error.message : "Apple sign-in could not be verified." }, 401);
  }

  if (body.link === true) {
    const session = await readClientMobileSession();
    if (!session) return mobileJson({ error: "Sign in to CDS Space first." }, 401);
    const connected = await connectProviderToClient({
      clientUserId: session.subject,
      provider: "apple",
      subject: apple.subject,
      email: apple.email,
    }).catch(() => null);
    if (!connected) return mobileJson({ error: "This Apple ID could not be connected. Please try again." }, 400);
    return mobileJson({ ok: true });
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
      error: "Apple did not share a verified email. Sign in with your email and password, then connect Apple in Account Config.",
    }, 400);
  }

  const fullName = str(body.fullName).trim().slice(0, 200);
  const user = await prepareDirectOAuthUser({
    provider: "apple",
    subject: apple.subject,
    email,
    name: fullName,
    picture: "",
  });
  const finalized = await finalizeClientOAuthSignIn({ auth: { signOut: async () => undefined }, user, next: null });
  const payload = (await finalized.json().catch(() => ({}))) as { ok?: boolean; clientUserId?: string; error?: string };
  if (!payload.ok || !payload.clientUserId) {
    return mobileJson({ error: payload.error || "This account cannot sign in to the CDS Space client app." }, 403);
  }

  const session = await issueClientMobileSession(
    { id: payload.clientUserId, email },
    { platform: body.platform, deviceName: body.deviceName },
  );
  return mobileJson({ success: true, token: session.token, expiresAt: session.expiresAt });
}
