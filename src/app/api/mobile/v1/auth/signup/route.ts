import { signup } from "@/lib/actions/auth";
import { EMAIL_CHECK_LIMITED_MESSAGE, EXISTING_ACCOUNT_MESSAGE, lookupRegisteredClientEmail } from "@/lib/client-account-exists";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Step 1 of mobile sign-up. Same checks as the web form (bot proof, rate
// limits, deliverable email); a six-digit code is emailed.
// Unlike the web form, the app says when the address already has an account
// (the web form answers "sent" either way and emails nothing).
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const registered = await lookupRegisteredClientEmail(str(body.email));
  if (registered === "limited") return mobileJson({ error: EMAIL_CHECK_LIMITED_MESSAGE }, 429);
  if (registered === "exists") return mobileJson({ error: EXISTING_ACCOUNT_MESSAGE }, 400);
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
