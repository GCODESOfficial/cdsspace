import { resendClientLoginChallenge } from "@/lib/client-login-flow";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const result = await resendClientLoginChallenge({ challengeId: str(body.challengeId), binding: str(body.binding) });
  return mobileJson(result, "error" in result ? 400 : 200);
}
