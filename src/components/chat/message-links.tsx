"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/** Covers public URLs plus the relative cMeet links stored in chat messages. */
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?()]|\/meet\/[a-z0-9-]+(?:\/[a-z0-9-]+)?(?:\?[^\s<]*)?)/gi;
const MARKDOWN_OR_URL_REGEX = /(\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?()]|\/meet\/[a-z0-9-]+(?:\/[a-z0-9-]+)?(?:\?[^\s<]*)?))/gi;

function normalizeHref(raw: string): string {
    if (raw.startsWith("/")) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
}

/**
 * Split a message body into alternating text + link fragments and render
 * the links as real <a> tags. Preserves whitespace + linebreaks via
 * whitespace-pre-wrap on the outer span. Safe to use on user input -
 * React escapes text nodes, we only pull URLs from a tight regex.
 */
export function isMeetingLink(url: string): boolean {
    try {
        return /^\/meet\/[a-z0-9-]+(?:\/[a-z0-9-]+)?\/?$/i.test(new URL(url, "https://cdsspace.pro").pathname);
    } catch {
        return false;
    }
}

export function Linkified({
    text,
    className,
}: {
    text: string;
    className?: string;
    onMeetingLink?: (url: string) => void;
}) {
    if (!text) return null;
    const parts: Array<
        string |
        { kind: "link"; url: string; display: string } |
        { kind: "bold"; display: string }
    > = [];
    let last = 0;
    for (const m of text.matchAll(MARKDOWN_OR_URL_REGEX)) {
        if (m.index === undefined) continue;
        if (m.index > last) parts.push(text.slice(last, m.index));
        if (m[2]) {
            parts.push({ kind: "bold", display: m[2] });
        } else if (m[3] && m[4]) {
            parts.push({ kind: "link", url: normalizeHref(m[4]), display: m[3] });
        } else if (m[5]) {
            parts.push({ kind: "link", url: normalizeHref(m[5]), display: m[5] });
        }
        last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));

    return (
        <span className={className}>
            {parts.map((part, index) => {
                if (typeof part === "string") return <span key={index}>{part}</span>;
                if (part.kind === "bold") return <strong key={index} className="font-bold">{part.display}</strong>;
                if (isMeetingLink(part.url)) {
                    return (
                        <Link
                            key={index}
                            href={part.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 break-words hover:opacity-80"
                        >
                            {part.display}
                        </Link>
                    );
                }
                return (
                    <a
                        key={index}
                        href={part.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 break-words hover:opacity-80"
                    >
                        {part.display}
                    </a>
                );
            })}
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
 * The preview service can only fetch an absolute URL, but chat stores cMeet
 * links as bare paths ("/meet/calm-cloud-40/..."). Sent as-is they came back
 * "invalid url" and the card silently never appeared - which is why meeting
 * links previewed in team chat, where they are stored absolute, and nowhere
 * else. Resolving against the current origin fixes both, including every
 * message already sitting in a thread.
 */
function absoluteTarget(url: string): string | null {
    try {
        // No window during server rendering; the fetch only runs in the effect.
        const base = typeof window === "undefined" ? undefined : window.location.origin;
        return new URL(url, base).toString();
    } catch {
        return null;
    }
}

/**
 * Lightweight OG card. Fetches /api/link-preview once per URL (module-level
 * memoised), renders nothing while loading, renders nothing if the URL
 * returned no useful metadata. Kept visually compact so it doesn't
 * dominate the bubble.
 */
export function LinkPreview({ url, variant = "light" }: { url: string; variant?: "light" | "dark" }) {
    const [preview, setPreview] = useState<Preview | null | undefined>(() => {
        const target = absoluteTarget(url);
        return target && cache.has(target) ? (cache.get(target) as Preview | null) : undefined;
    });

    useEffect(() => {
        const target = absoluteTarget(url);
        if (!target) {
            setPreview(null);
            return;
        }
        if (cache.has(target)) {
            setPreview(cache.get(target) as Preview | null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/link-preview?url=${encodeURIComponent(target)}`);
                const json = await res.json();
                const p = (json?.preview as Preview) || null;
                cache.set(target, p);
                if (!cancelled) setPreview(p);
            } catch {
                cache.set(target, null);
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
