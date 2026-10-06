import { NextRequest, NextResponse } from "next/server";

/**
 * Helpers for the admin app's Team & HR routes (src/app/api/mobile/v1/admin/people/**).
 *
 * A few web admin routes (HR compliance, Team compliance) reject any write whose
 * Origin header is not this site (assertTrustedMutationOrigin): a CSRF guard for
 * the browser's cookie session. The app has no Origin; it authenticates with its
 * Bearer token, which src/proxy.ts swaps for the admin_session cookie and marks
 * with `x-cds-client-path`. A browser cannot send that header cross-site without
 * a CORS preflight (which this site never grants), so a request that carries it
 * came through the Bearer path and CSRF does not apply.
 */

export function isAppAdminRequest(req: NextRequest) {
  return !!req.headers.get("x-cds-client-path");
}

/**
 * Replays an app request against a web route handler with this site's Origin,
 * so the handler's own permission checks, validation and logging run unchanged.
 */
export async function forwardWithTrustedOrigin(
  req: NextRequest,
  handler: (request: NextRequest) => Promise<Response>,
  targetPath: string,
): Promise<Response> {
  if (!isAppAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "This endpoint is only for the CDS Space app." }, { status: 403 });
  }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const headers = new Headers(req.headers);
  headers.set("origin", `https://${host}`);
  const url = new URL(targetPath, req.nextUrl.origin);
  req.nextUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value));
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  return handler(new NextRequest(url, { method: req.method, headers, body }));
}
