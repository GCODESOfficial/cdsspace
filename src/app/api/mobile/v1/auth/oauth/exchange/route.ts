import { consumeHandoffCode } from "@/lib/mobile-handoff";
import { issueClientMobileSession } from "@/lib/client-mobile-session";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { mobileJson, readMobileBody } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Step 2 of Google/LinkedIn sign-in in the app: swap the one-time code from the
// browser for a device session. The app then loads GET /api/mobile/v1/me with it.
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const spent = await consumeHandoffCode("app_signin", body.code);
  if (!spent) return mobileJson({ error: "This sign-in has expired. Please try again." }, 400);

  const profile = await glashMaybeOne<{ account_status: string }>(
    "select account_status from public.profiles where id = $1::uuid limit 1",
    [spent.user_id],
  );
  if (profile?.account_status !== "active") {
    return mobileJson({ error: "This CDS Space business account is not active." }, 403);
  }

  const session = await issueClientMobileSession(
    { id: spent.user_id, email: spent.email },
    { platform: body.platform, deviceName: body.deviceName },
  );
  return mobileJson({ success: true, token: session.token, expiresAt: session.expiresAt });
}
