import { completeClientPasswordReset } from "@/lib/actions/auth";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Completes a reset from the emailed link token. Signs every device out.
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const result = await completeClientPasswordReset({
    token: str(body.token),
    password: str(body.password),
    confirmPassword: str(body.confirmPassword),
  });
  return mobileJson(result, "error" in result ? 400 : 200);
}
