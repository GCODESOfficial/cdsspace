import { verifyClientLoginChallenge } from "@/lib/client-login-flow";
import { getClientAccountState } from "@/lib/client-account";
import { issueClientMobileSession } from "@/lib/client-mobile-session";
import { mobileJson, readMobileBody, serializeClientMe, str } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Step 2 of mobile sign-in: the emailed code plus the binding from step 1.
// Success returns a revocable device token for "Authorization: Bearer".
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const result = await verifyClientLoginChallenge({
    challengeId: str(body.challengeId),
    otp: str(body.otp),
    binding: str(body.binding),
  });
  if (!result.success) return mobileJson(result, 400);

  const session = await issueClientMobileSession(result.user, {
    platform: body.platform,
    deviceName: body.deviceName,
  });
  const state = await getClientAccountState().catch(() => null);
  const me = state ? await serializeClientMe(state) : null;
  return mobileJson({ success: true, token: session.token, expiresAt: session.expiresAt, me });
}
