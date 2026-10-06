import { NextRequest, NextResponse } from "next/server";

/**
 * Deals for the mobile admin app.
 *
 * The web Deals routes (/api/admin/deals, /prospect-generation, /upload) refuse
 * any mutation without a same-host Origin header (assertTrustedMutationOrigin).
 * That is CSRF protection for the browser's cookie session; the app
 * authenticates with a bearer token instead and sends no Origin at all, so every
 * write would be rejected. The mobile routes hand the very same request to the
 * web handler with the request's own origin stamped on it, so the app runs
 * exactly the web logic, permissions and responses.
 *
 * Only requests that arrived with the app's bearer token are forwarded:
 * src/proxy.ts swaps that token for the admin_session cookie and sets
 * x-cds-client-path, which a cross-site browser request cannot add without a
 * CORS preflight this route never answers.
 */
export async function forwardAppMutation(
  req: NextRequest,
  handler: (request: NextRequest) => Promise<Response> | Response,
): Promise<Response> {
  if (!req.headers.get("x-cds-client-path")) {
    return NextResponse.json({ ok: false, error: "This route is only for the CDS Space app." }, { status: 403 });
  }
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host)
    .split(",")[0]
    .trim();
  const headers = new Headers(req.headers);
  headers.set("origin", `https://${host}`);
  const body = await req.arrayBuffer();
  const forwarded = new NextRequest(req.url, {
    method: req.method,
    headers,
    body: body.byteLength ? body : undefined,
  });
  return handler(forwarded);
}
