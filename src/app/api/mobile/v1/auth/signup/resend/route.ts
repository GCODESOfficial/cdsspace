import { resendClientSignupVerification } from "@/lib/actions/auth";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const result = await resendClientSignupVerification({ email: str(body.email) });
  return mobileJson(result, "error" in result ? 400 : 200);
}
