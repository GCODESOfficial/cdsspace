import "server-only";

import crypto from "node:crypto";
import sanitizeHtml from "sanitize-html";
import type { NextRequest } from "next/server";

const ALLOWED_RICH_TAGS = [
  "p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li", "blockquote", "a", "figure", "figcaption", "img",
  "table", "thead", "tbody", "tr", "th", "td", "hr", "sup", "sub", "code", "pre",
];

export function sanitizeIntelligenceHtml(input: unknown): string {
  return sanitizeHtml(String(input || ""), {
    allowedTags: ALLOWED_RICH_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      th: ["scope", "colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      code: ["class"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attrs) => ({
        tagName: "a",
        attribs: {
          ...attrs,
          rel: "noopener noreferrer nofollow",
          ...(attrs.target === "_blank" ? { target: "_blank" } : {}),
        },
      }),
      img: (_tag, attrs) => ({
        tagName: "img",
        attribs: { ...attrs, loading: "lazy" },
      }),
    },
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
}

export function cleanText(input: unknown, max = 5000): string {
  return sanitizeHtml(String(input || ""), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function safePublicUrl(input: unknown, options: { allowMailto?: boolean; sameOriginOnly?: boolean } = {}): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  try {
    const url = raw.startsWith("/") ? new URL(raw, "https://cdsspace.pro") : new URL(raw);
    if (url.protocol !== "https:" && !(options.allowMailto && url.protocol === "mailto:")) return null;
    if (options.sameOriginOnly && url.hostname !== "cdsspace.pro" && !url.hostname.endsWith(".cdsspace.pro")) return null;
    return raw.startsWith("/") ? `${url.pathname}${url.search}${url.hash}` : url.toString();
  } catch {
    return null;
  }
}

export function assertTrustedMutationOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host && (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export function requestFingerprint(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const value = [forwarded || "unknown", req.headers.get("user-agent") || "unknown"].join("|");
  const salt = process.env.INTELLIGENCE_ANALYTICS_SALT || process.env.NEXTAUTH_SECRET || "cds-intelligence";
  return crypto.createHmac("sha256", salt).update(value).digest("hex");
}

export function classifyDevice(userAgent: string | null): "mobile" | "tablet" | "desktop" | "unknown" {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return "unknown";
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobile|iphone|android/.test(ua)) return "mobile";
  return "desktop";
}
