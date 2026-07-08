"use client";

import { useEffect, useState } from "react";

/** Crude URL matcher - covers http/https + bare www. domains. */
const URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?()])/gi;

function normalizeHref(raw: string): string {
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
}

/**
 * Split a message body into alternating text + link fragments and render
 * the links as real <a> tags. Preserves whitespace + linebreaks via
 * whitespace-pre-wrap on the outer span. Safe to use on user input -
 * React escapes text nodes, we only pull URLs from a tight regex.
 */
export function Linkified({ text, className }: { text: string; className?: string }) {
    if (!text) return null;
    const parts: Array<string | { url: string; display: string }> = [];
    let last = 0;
    for (const m of text.matchAll(URL_REGEX)) {
        if (m.index === undefined) continue;
        if (m.index > last) parts.push(text.slice(last, m.index));
        parts.push({ url: normalizeHref(m[1]), display: m[1] });
        last = m.index + m[1].length;
    }
    if (last < text.length) parts.push(text.slice(last));

    return (
        <span className={className}>
            {parts.map((p, i) =>
                typeof p === "string" ? (
                    <span key={i}>{p}</span>
                ) : (
                    <a
                        key={i}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 break-words hover:opacity-80"
                    >
                        {p.display}
                    </a>
                ),
            )}
        </span>
    );
}

/** Return the first URL in a string, or null. */
export function firstUrl(text: string | null | undefined): string | null {
    if (!text) return null;
    const m = URL_REGEX.exec(text);
    URL_REGEX.lastIndex = 0; // reset - global regex shares state across calls
    return m ? normalizeHref(m[1]) : null;
}

interface Preview {
    url: string;
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string | null;
    favicon: string | null;
}

const cache = new Map<string, Preview | null>();

/**
 * Lightweight OG card. Fetches /api/link-preview once per URL (module-level
 * memoised), renders nothing while loading, renders nothing if the URL
 * returned no useful metadata. Kept visually compact so it doesn't
 * dominate the bubble.
 */
export function LinkPreview({ url, variant = "light" }: { url: string; variant?: "light" | "dark" }) {
    const [preview, setPreview] = useState<Preview | null | undefined>(
        cache.has(url) ? (cache.get(url) as Preview | null) : undefined,
    );

    useEffect(() => {
        if (cache.has(url)) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
                const json = await res.json();
                const p = (json?.preview as Preview) || null;
                cache.set(url, p);
                if (!cancelled) setPreview(p);
            } catch {
                cache.set(url, null);
                if (!cancelled) setPreview(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [url]);

    if (!preview) return null;
    // Bail out if we got nothing useful - a title that's just the bare
    // hostname with no description is not worth the card real estate.
    const hasBody = preview.title && (preview.description || preview.image);
    if (!hasBody) return null;

    const dark = variant === "dark";

    return (
        <a
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-2 block rounded-xl border overflow-hidden transition hover:opacity-95 ${
                dark ? "bg-white/10 border-white/20" : "bg-white border-gray-200"
            }`}
        >
            {preview.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={preview.image}
                    alt=""
                    className="w-full max-h-48 object-cover"
                    loading="lazy"
                />
            )}
            <div className="px-3 py-2.5">
                <div className={`flex items-center gap-1.5 text-[10.5px] mb-0.5 ${dark ? "text-white/70" : "text-gray-500"}`}>
                    {preview.favicon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview.favicon} alt="" className="w-3.5 h-3.5 rounded-xs" loading="lazy" />
                    )}
                    <span className="truncate">{preview.siteName || new URL(preview.url).hostname}</span>
                </div>
                {preview.title && (
                    <p className={`text-[12.5px] font-semibold leading-snug line-clamp-2 ${dark ? "text-white" : "text-[#0D1B39]"}`}>
                        {preview.title}
                    </p>
                )}
                {preview.description && (
                    <p className={`text-[11.5px] leading-snug mt-1 line-clamp-2 ${dark ? "text-white/80" : "text-gray-500"}`}>
                        {preview.description}
                    </p>
                )}
            </div>
        </a>
    );
}
