import { requestClientPasswordReset } from "@/lib/actions/auth";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Always answers the same way whether or not the account exists.
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const result = await requestClientPasswordReset({ email: str(body.email), botToken: str(body.botToken) });
  return mobileJson(result, "error" in result ? 400 : 200);
}
