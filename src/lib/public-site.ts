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
