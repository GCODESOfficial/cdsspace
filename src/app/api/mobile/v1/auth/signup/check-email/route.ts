import { EMAIL_CHECK_LIMITED_MESSAGE, EXISTING_ACCOUNT_MESSAGE, lookupRegisteredClientEmail } from "@/lib/client-account-exists";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// The app's sign-up form checks the email as soon as it is entered, so the
// person learns it is taken before filling in the rest.
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const status = await lookupRegisteredClientEmail(str(body.email));
  if (status === "limited") return mobileJson({ error: EMAIL_CHECK_LIMITED_MESSAGE }, 429);
  return mobileJson(status === "exists" ? { exists: true, error: EXISTING_ACCOUNT_MESSAGE } : { exists: false });
}
