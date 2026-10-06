import { startClientLogin } from "@/lib/client-login-flow";
import { mobileJson, readMobileBody, str } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// Step 1 of mobile sign-in: password check, then a code is emailed. The web
// keeps the login binding in an HttpOnly cookie; the app receives it here and
// must send it back with the code, so only this device can finish the sign-in.
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const { result, binding } = await startClientLogin({
    email: str(body.email),
    password: str(body.password),
    botToken: str(body.botToken),
  });
  if (!binding) return mobileJson(result, 400);
  return mobileJson({ ...result, binding });
}
