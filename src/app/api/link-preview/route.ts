import { NextRequest, NextResponse } from "next/server";
import { assertPublicHttpUrl, UnsafeOutboundUrlError } from "@/lib/safe-outbound-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/link-preview?url=https://example.com
 *
 * Fetches a URL and returns a small Open Graph summary. Used to render
 * rich previews under links shared in team chat. Anonymous - no auth
 * required because the data is already publicly reachable at the URL.
 *
 * Safeguards:
 *   - Only http / https URLs
 *   - 6s timeout
 *   - reads only up to </head>, at most 2MB (some pages, e.g. YouTube, put
 *     their preview tags ~700KB in)
 *   - Successful summaries may be cached by clients for up to 1h
 */

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;

const META_TAG_RE = /<meta\b[^>]*>/gi;
const ATTR_RE = /([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const LINK_TAG_RE = /<link\b[^>]*>/gi;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(value: string) {
    return value
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
        .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
        .replace(/\s+/g, " ")
        .trim();
}

function safeCodePoint(code: number) {
    try {
        return String.fromCodePoint(code);
    } catch {
        return "";
    }
}

function attributes(tag: string) {
    const attrs: Record<string, string> = {};
    for (const match of tag.matchAll(ATTR_RE)) {
        attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    }
    return attrs;
}

/**
 * Every <meta property|name|itemprop="…" content="…"> in the page, keyed by
 * its lower-cased name. Attribute order and quoting vary between sites, so
 * each tag is parsed as a whole rather than with one fixed pattern.
 */
function metaTags(html: string) {
    const meta = new Map<string, string>();
    for (const [tag] of html.matchAll(META_TAG_RE)) {
        const attrs = attributes(tag);
        const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
        const content = attrs.content;
        if (key && content && !meta.has(key)) meta.set(key, decodeEntities(content));
    }
    return meta;
}

const first = (meta: Map<string, string>, ...keys: string[]) => {
    for (const key of keys) {
        const value = meta.get(key);
        if (value) return value;
    }
    return null;
};

function iconHref(html: string) {
    for (const [tag] of html.matchAll(LINK_TAG_RE)) {
        const attrs = attributes(tag);
        if (/(^|\s)(shortcut\s+)?icon(\s|$)|apple-touch-icon/i.test(attrs.rel || "") && attrs.href) return decodeEntities(attrs.href);
    }
    return null;
}

function absolutize(candidate: string | null, base: string): string | null {
    if (!candidate) return null;
    try {
        return new URL(candidate, base).toString();
    } catch {
        return null;
    }
}

async function safeAssetUrl(candidate: string | null, base: string) {
    const absolute = absolutize(candidate, base);
    if (!absolute) return null;
    try {
        return (await assertPublicHttpUrl(absolute)).toString();
    } catch {
        return null;
    }
}

async function fetchWithSafeRedirects(initial: URL, signal: AbortSignal) {
    let current = initial;
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        current = await assertPublicHttpUrl(current);
        const response = await fetch(current, {
            signal,
            redirect: "manual",
            headers: {
                // Many sites only include their preview tags for link-preview bots.
                "user-agent": "Mozilla/5.0 (compatible; CDSSpace-LinkPreview/1.0; +https://cdsspace.pro)",
                "accept-language": "en",
                accept: "text/html,application/xhtml+xml",
            },
            cache: "no-store",
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) return response;
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) throw new UnsafeOutboundUrlError("Too many redirects.");
        current = new URL(location, current);
    }
    throw new UnsafeOutboundUrlError("Too many redirects.");
}

export async function GET(req: NextRequest) {
    const target = req.nextUrl.searchParams.get("url");
    if (!target) {
        return NextResponse.json({ ok: false, error: "url required" }, { status: 400 });
    }

    let parsed: URL;
    try {
        parsed = await assertPublicHttpUrl(target);
    } catch {
        return NextResponse.json({ ok: false, error: "invalid url" }, { status: 400 });
    }
    if (!/^https?:$/.test(parsed.protocol)) {
        return NextResponse.json({ ok: false, error: "only http/https supported" }, { status: 400 });
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetchWithSafeRedirects(parsed, ctrl.signal);

        if (!res.ok) {
            return NextResponse.json(
                { ok: true, preview: { url: parsed.toString(), title: parsed.hostname } },
                { headers: { "cache-control": "public, max-age=300" } },
            );
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        let html = "";
        if (reader) {
            let read = 0;
            while (read < MAX_BYTES) {
                const { value, done } = await reader.read();
                if (done) break;
                read += value.byteLength;
                html += decoder.decode(value, { stream: true });
                // The preview tags live in the <head>; stop once it has ended.
                if (/<\/head>/i.test(html.slice(-(value.byteLength + 16)))) break;
            }
            try {
                await reader.cancel();
            } catch {
                /* ignore */
            }
        } else {
            html = await res.text();
        }

        const finalUrl = res.url || parsed.toString();
        const meta = metaTags(html);
        const pageTitle = TITLE_RE.exec(html)?.[1];
        const title =
            first(meta, "og:title", "twitter:title") ||
            (pageTitle ? decodeEntities(pageTitle) : null) ||
            parsed.hostname;
        const description = first(meta, "og:description", "twitter:description", "description");
        const image = await safeAssetUrl(
            first(meta, "og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src", "image"),
            finalUrl,
        );
        const siteName = first(meta, "og:site_name", "application-name") || parsed.hostname.replace(/^www\./, "");
        const favicon = await safeAssetUrl(iconHref(html) || `${new URL(finalUrl).origin}/favicon.ico`, finalUrl);

        return NextResponse.json(
            {
                ok: true,
                preview: { url: finalUrl, title, description, image, siteName, favicon },
            },
            { headers: { "cache-control": "public, max-age=3600" } },
        );
    } catch {
        // Any failure returns a minimal preview so the UI doesn't block.
        return NextResponse.json({
            ok: true,
            preview: { url: parsed.toString(), title: parsed.hostname, siteName: parsed.hostname },
        });
    } finally {
        clearTimeout(timer);
    }
}
