const DEFAULT_PUBLIC_SITE_ORIGIN = "https://cdsspace.pro";

/**
 * Canonical origin for every externally shareable CDS Space resource.
 * Never derive public links from request origins: reverse proxies may expose
 * an internal localhost host even while serving the production website.
 */
export function publicSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      const isLocalOrigin = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
      if ((url.protocol === "https:" || url.protocol === "http:") && !isLocalOrigin) return url.origin;
    } catch {
      // Use the canonical production origin below.
    }
  }
  return DEFAULT_PUBLIC_SITE_ORIGIN;
}

export function absolutePublicUrl(path: string) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return new URL(safePath, `${publicSiteOrigin()}/`).toString();
}

type RequestOriginSource = {
  headers: Headers;
  nextUrl: {
    host: string;
    protocol: string;
  };
};

/**
 * Origin for browser redirects and provider callbacks.
 *
 * Production must always use the configured/canonical public host because the
 * application server can receive an internal `localhost:3000` URL from the
 * deployment proxy. Local development still follows the browser-facing host.
 */
export function applicationOrigin(request: RequestOriginSource) {
  if (process.env.NODE_ENV === "production") return publicSiteOrigin();

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || request.nextUrl.protocol.replace(":", "") || "http";
  return `${protocol}://${host}`;
}

export function absoluteApplicationUrl(path: string, request: RequestOriginSource) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return new URL(safePath, `${applicationOrigin(request)}/`);
}
