import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/glashdb/server";
import { getVerifiedAuthUser } from "@/lib/glashdb/auth-user";
import { finalizeClientOAuthSignIn } from "@/lib/client-oauth";

/**
 * Finalize an OAuth sign-in once the browser has set the session cookies
 * (see /auth/callback). Runs server-side so it can: (1) read the httpOnly
 * `cds_oauth_next` destination cookie, (2) ensure a `profiles` row exists for
 * first-time Google users. Returns where the client should land. No Supabase.
 */
export async function POST(request: NextRequest) {
  const { client: glash, applyCookies } = createRouteClient(request);
  const user = await getVerifiedAuthUser(glash.auth);

  if (!user) {
    return applyCookies(clearOAuthDestination(
      NextResponse.json({ ok: false, error: "OAuth session could not be verified." }, { status: 401 }),
    ));
  }

  try {
    const response = await finalizeClientOAuthSignIn({
      auth: glash.auth,
      user,
      next: request.cookies.get("cds_oauth_next")?.value,
    });
    return applyCookies(clearOAuthDestination(response));
  } catch (error) {
    console.error("[client-auth] OAuth finalization failed", error);
    return applyCookies(clearOAuthDestination(
      NextResponse.json({ ok: false, error: "Client account setup could not be completed." }, { status: 500 }),
    ));
  }
}

function clearOAuthDestination(response: NextResponse) {
  response.cookies.set("cds_oauth_next", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
