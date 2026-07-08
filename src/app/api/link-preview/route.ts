import { NextRequest, NextResponse } from "next/server";

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
 *   - 512KB body cap (we only need the <head>)
 *   - Response is cached for 1h (per URL) via Next's fetch cache
 */

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6000;

const META_RE_OG_TITLE = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i;
const META_RE_OG_DESC = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i;
const META_RE_OG_IMAGE = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i;
const META_RE_OG_SITE = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i;
const META_RE_TITLE = /<title[^>]*>([^<]+)<\/title>/i;
const META_RE_DESCRIPTION = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i;
const META_RE_ICON = /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)/i;

function extract(html: string, regex: RegExp): string | null {
    const m = regex.exec(html);
    return m && m[1] ? m[1].trim() : null;
}

function absolutize(candidate: string | null, base: string): string | null {
    if (!candidate) return null;
    try {
        return new URL(candidate, base).toString();
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const target = req.nextUrl.searchParams.get("url");
    if (!target) {
        return NextResponse.json({ ok: false, error: "url required" }, { status: 400 });
    }

    let parsed: URL;
    try {
        parsed = new URL(target);
    } catch {
        return NextResponse.json({ ok: false, error: "invalid url" }, { status: 400 });
    }
    if (!/^https?:$/.test(parsed.protocol)) {
        return NextResponse.json({ ok: false, error: "only http/https supported" }, { status: 400 });
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(parsed.toString(), {
            signal: ctrl.signal,
            redirect: "follow",
            headers: {
                "user-agent": "CDSSpace-LinkPreview/1.0",
                accept: "text/html,application/xhtml+xml",
            },
            next: { revalidate: 3600 },
        });

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
        const title =
            extract(html, META_RE_OG_TITLE) ||
            extract(html, META_RE_TITLE) ||
            parsed.hostname;
        const description =
            extract(html, META_RE_OG_DESC) || extract(html, META_RE_DESCRIPTION) || null;
        const image = absolutize(extract(html, META_RE_OG_IMAGE), finalUrl);
        const siteName = extract(html, META_RE_OG_SITE) || parsed.hostname;
        const favicon =
            absolutize(extract(html, META_RE_ICON), finalUrl) ||
            `${parsed.origin}/favicon.ico`;

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
