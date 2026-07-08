/**
 * Helpers for rendering portfolio work assets. Gallery assets are usually
 * images, but admins can also upload a PDF (e.g. a multi-page brand deck) in
 * place of images - those are presented in an <iframe>.
 *
 * Security: an <iframe src> is an injection surface. Even though asset URLs
 * come from our own DB, we defensively allowlist the host so a tampered or
 * malformed value (javascript:, data:text/html, an external phishing/clickjack
 * origin) can never be framed. Anything that fails validation falls back to a
 * plain link instead of an embed.
 */

/** Hosts we trust to embed in an <iframe> - our own storage/CDN origins. */
const ALLOWED_EMBED_HOSTS: ReadonlySet<string> = (() => {
  const hosts = new Set<string>();
  for (const v of [process.env.NEXT_PUBLIC_GLASHDB_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]) {
    if (!v) continue;
    try {
      hosts.add(new URL(v).hostname);
    } catch {
      /* ignore malformed env */
    }
  }
  return hosts;
})();

/** True when the URL points at a PDF (ignoring any query string / fragment). */
export function isPdfUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url, "https://_.invalid").pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return /\.pdf(?:[?#]|$)/i.test(url);
  }
}

/**
 * Return the URL only if it is safe to embed in an <iframe>: an http(s) URL on
 * one of our allowlisted storage hosts. Returns null otherwise (→ caller should
 * render a link, never an iframe). Blocks javascript:/data:/blob: and any
 * third-party origin - the core mitigation against iframe-src injection.
 */
export function safeEmbedUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  // When we know our storage hosts, require a match. If none are configured
  // (misconfig), we still required http(s) above, which blocks the dangerous
  // pseudo-protocols.
  if (ALLOWED_EMBED_HOSTS.size > 0 && !ALLOWED_EMBED_HOSTS.has(u.hostname)) return null;
  return u.toString();
}

/** Same allowlist, but for a normal link target (anchor href). */
export function safeHref(url: string | null | undefined): string | null {
  return safeEmbedUrl(url);
}
