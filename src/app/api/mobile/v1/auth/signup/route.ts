import { signup } from "@/lib/actions/auth";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Step 1 of mobile sign-up. Same checks as the web form (bot proof, rate
// limits, deliverable email); a six-digit code is emailed.
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const result = await signup({
    email: str(body.email),
    password: str(body.password),
    fullName: str(body.fullName),
    phoneNumber: str(body.phoneNumber),
    companyName: str(body.companyName),
    clientInvite: str(body.clientInvite) || null,
    botToken: str(body.botToken),
  });
  return mobileJson(result, "error" in result ? 400 : 200);
}
