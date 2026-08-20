import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/glashdb/server";
import { getVerifiedAuthUser } from "@/lib/glashdb/auth-user";
import { finalizeClientOAuthSignIn } from "@/lib/client-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = String(body?.code || "");
  if (!code || code.length > 4096) {
    return clearOAuthDestination(
      NextResponse.json({ ok: false, error: "Invalid OAuth response." }, { status: 400 }),
    );
  }

  const { client: glash, applyCookies } = createRouteClient(request);
  const { error } = await glash.auth.exchangeCodeForSession(code);
  if (error) {
    return applyCookies(clearOAuthDestination(
      NextResponse.json({ ok: false, error: "OAuth exchange failed." }, { status: 400 }),
    ));
  }

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
