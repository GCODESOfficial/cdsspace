import { verifyClientSignupCode } from "@/lib/actions/auth";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Confirms the sign-up code. As on the web, no session is created here: the
// client signs in next, which sends the second (sign-in) code.
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const result = await verifyClientSignupCode({ email: str(body.email), code: str(body.code) });
  if ("error" in result) return mobileJson(result, 400);
  return mobileJson({ success: true });
}
