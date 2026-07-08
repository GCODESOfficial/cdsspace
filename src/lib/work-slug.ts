/**
 * Convert a project title into a URL-safe slug.
 *   "Adeesi - Premium Grain"  →  "adeesi-premium-grain"
 *
 * Pure; no dependencies. Safe to import from client or server.
 */
export function slugifyTitle(title: string): string {
    return title
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}
