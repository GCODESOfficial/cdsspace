/**
 * Shared OG card used by every `opengraph-image.tsx` in this app.
 *
 * Template (matches the sample screenshot + brand system):
 *   - /public/metabg.png full-bleed background
 *   - /public/mlogo.svg wordmark top-left
 *   - Optional status / eyebrow pill top-right
 *   - Huge bold title left-centre
 *   - Subtitle / client line under the title
 *   - Globe-cursor icon + "cdsspace.com" bottom-left
 *
 * Typography: Inter 400 / 700 / 800 via `src/lib/og/fonts.ts`. Title uses 800.
 */
import type { ReactElement } from "react";
import fs from "node:fs";
import path from "node:path";

// Canonical Facebook / WhatsApp / Meta OG size. Staying at 1.91:1 avoids
// the white letterboxing WhatsApp/Meta apply when the source is 16:9.
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;
export const SITE_URL = "https://cdsspace.pro";

/**
 * Read /public/metabg.png as a base64 data URI.
 *
 * Reads are resolved at request time against the relative path from this
 * source file rather than `process.cwd()/public/...`. Static path literals
 * like `new URL("../../...", import.meta.url)` are picked up by Next.js's
 * build tracer, so the PNG is reliably copied into the serverless bundle.
 * If tracing still misses the file (older Vercel runtimes), the card
 * falls back to the navy gradient defined in `Background`.
 */
/**
 * Try each candidate path in order until one works. Next.js / Turbopack
 * sometimes resolves `new URL("...", import.meta.url)` to a path that
 * doesn't exist at runtime, and `process.cwd()` isn't always the project
 * root on Vercel serverless - so we try both.
 */
/**
 * Load a /public asset at module-evaluation time and cache the base64
 * data URI. Satori inlines data URIs directly so there's no runtime fetch -
 * which means the same rendering works at build time (static prerender)
 * and at request time (serverless lambda) without any network dependency.
 * We try both the ESM `import.meta.url` anchor and the traditional
 * `process.cwd()` path to survive Turbopack / Webpack differences.
 */
/**
 * Read a file from /public. IMPORTANT: use only `process.cwd()` as the
 * anchor. An earlier version also tried `new URL(..., import.meta.url)` -
 * Next.js's build tracer interprets that pattern as a dynamic asset
 * reference and pulls the ENTIRE /public/ tree (videos, high-res SVGs)
 * into every serverless function, which blows past the 300MB Vercel cap.
 */
function readPublicAsset(_relFromHere: string, relFromCwd: string): Buffer | null {
    try {
        return fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), relFromCwd));
    } catch {
        return null;
    }
}

// Lazy lookups - DO NOT eagerly evaluate these at module load. Baking the
// ~374KB base64 PNG into a top-level const caused Vercel's tracer to
// duplicate the bytes into every transitive consumer, blowing past the
// 300MB function-size cap. Instead each OG render calls the getter on
// demand and caches the result in a local let for subsequent renders in
// the same lambda instance.
let bgDataUriCache: string | null = null;
export function getMetadataBgDataUri(): string {
    if (bgDataUriCache !== null) return bgDataUriCache;
    const buf = readPublicAsset(
        "../../../public/metabg.png",
        "public/metabg.png",
    );
    bgDataUriCache = buf ? `data:image/png;base64,${buf.toString("base64")}` : "";
    return bgDataUriCache;
}

let logoDataUriCache: string | null = null;
export function getCdsLogoDataUri(): string {
    if (logoDataUriCache !== null) return logoDataUriCache;
    const buf = readPublicAsset(
        "../../../public/mlogo.svg",
        "public/mlogo.svg",
    );
    if (!buf) {
        logoDataUriCache = "";
        return logoDataUriCache;
    }
    const svg = buf.toString("utf8");
    logoDataUriCache = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
    return logoDataUriCache;
}

// Back-compat shims for any callsite that still imports the constants.
export const METADATA_BG_DATA_URI = "";
export const CDS_LOGO_DATA_URI = "";

/** Simple globe-cursor SVG used in the bottom-left of every card. */
const GLOBE_ICON =
    "data:image/svg+xml;base64," +
    Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>`,
        "utf8",
    ).toString("base64");

/* ---------- Shared building blocks ---------- */

function Background({ bgDataUri, overlay }: { bgDataUri: string; overlay?: string | null }) {
    return (
        <>
            {/* Fallback gradient always rendered behind so even if satori
                can't load the PNG data URI we still land on navy, not white. */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: OG_SIZE.width,
                    height: OG_SIZE.height,
                    display: "flex",
                    background: "linear-gradient(135deg, #040b37 0%, #081149 55%, #0a1a6b 100%)",
                }}
            />
            {bgDataUri ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={bgDataUri}
                    alt=""
                    width={OG_SIZE.width}
                    height={OG_SIZE.height}
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: OG_SIZE.width,
                        height: OG_SIZE.height,
                    }}
                />
            ) : null}
            {overlay ? (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: OG_SIZE.width,
                        height: OG_SIZE.height,
                        background: overlay,
                        display: "flex",
                    }}
                />
            ) : null}
        </>
    );
}

function LogoLockup({ logoDataUri }: { logoDataUri: string }) {
    if (!logoDataUri) {
        return (
            <div
                style={{
                    fontSize: 42,
                    fontWeight: 800,
                    color: "#ffffff",
                    letterSpacing: 2,
                    display: "flex",
                }}
            >
                CDS SPACE
            </div>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={logoDataUri}
            alt="CDS Space - Branding Agency"
            width={190}
            height={73}
            style={{ display: "block" }}
        />
    );
}

function StatusPill({ label }: { label: string }) {
    return (
        <div
            style={{
                padding: "12px 26px",
                borderRadius: 999,
                background: "#ffffff",
                color: "#0D1B39",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 0.5,
                display: "flex",
            }}
        >
            {label}
        </div>
    );
}

function FooterDomain() {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
            }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={GLOBE_ICON} alt="" width={30} height={30} />
            <div
                style={{
                    fontSize: 25,
                    fontWeight: 600,
                    color: "#ffffff",
                    opacity: 0.92,
                    display: "flex",
                }}
            >
                cdsspace.com | cdsspace.pro
            </div>
        </div>
    );
}

/* ---------- Public renderers ---------- */

interface BrandCardProps {
    title: string;
    description?: string;
    tags?: string[];         // kept in the API for back-compat - not rendered
    eyebrow?: string;        // shown as the status pill top-right
    domainPath?: string;     // kept for back-compat; footer always shows cdsspace.com
}

/**
 * Marketing / dashboard pages. Title + one-line subtitle on the brand plate.
 */
export function renderBrandCard({
    title,
    description,
    eyebrow,
}: BrandCardProps): ReactElement {
    const bgDataUri = getMetadataBgDataUri();
    const logoDataUri = getCdsLogoDataUri();
    const titleSize = title.length > 40 ? 65 : title.length > 24 ? 80 : 95;
    return (
        <div
            style={{
                width: OG_SIZE.width,
                height: OG_SIZE.height,
                position: "relative",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                color: "#ffffff",
                fontFamily: "Inter, system-ui, -apple-system, sans-serif",
                padding: "65px 72px",
                background: "#ffffff",
            }}
        >
            <Background bgDataUri={bgDataUri} />

            {/* Top row: logo + optional status pill */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <LogoLockup logoDataUri={logoDataUri} />
                {eyebrow ? <StatusPill label={eyebrow} /> : <div style={{ display: "flex" }} />}
            </div>

            {/* Title block - centered vertically between logo row and footer */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    maxWidth: 1000,
                }}
            >
                <div
                    style={{
                        fontSize: titleSize,
                        fontWeight: 800,
                        lineHeight: 1.05,
                        letterSpacing: -1.5,
                        color: "#ffffff",
                        textShadow: "0 4px 40px rgba(4,11,55,0.45)",
                        display: "flex",
                    }}
                >
                    {title}
                </div>
                {description ? (
                    <div
                        style={{
                            fontSize: 26,
                            fontWeight: 500,
                            lineHeight: 1.35,
                            color: "#ffffff",
                            opacity: 0.88,
                            marginTop: 21,
                            maxWidth: 925,
                            display: "flex",
                        }}
                    >
                        {description}
                    </div>
                ) : null}
            </div>

            {/* Footer */}
            <FooterDomain />
        </div>
    );
}

/**
 * Work detail cards - the cover image IS the card. Minimal brand chrome so
 * the project visual reads cleanly. Kept for back-compat; /work/[slug] now
 * sends the raw cover URL as `og:image` rather than building this card.
 */
export function renderWorkCard({
    title,
    description,
    category,
    coverImageUrl,
}: {
    title: string;
    description?: string;
    tags?: string[];
    category?: string | null;
    coverImageUrl?: string | null;
    workSlug?: string;
    workId?: number | string;
}): ReactElement {
    const bgDataUri = getMetadataBgDataUri();
    const logoDataUri = getCdsLogoDataUri();
    const titleSize = title.length > 40 ? 60 : title.length > 24 ? 76 : 92;
    return (
        <div
            style={{
                width: OG_SIZE.width,
                height: OG_SIZE.height,
                position: "relative",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                color: "#ffffff",
                fontFamily: "Inter, system-ui, -apple-system, sans-serif",
                padding: "65px 72px",
                background: "#040b37",
            }}
        >
            {coverImageUrl ? (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={coverImageUrl}
                        alt=""
                        width={OG_SIZE.width}
                        height={OG_SIZE.height}
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: OG_SIZE.width,
                            height: OG_SIZE.height,
                            objectFit: "cover",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: OG_SIZE.width,
                            height: OG_SIZE.height,
                            background:
                                "linear-gradient(180deg, rgba(4,11,55,0.15) 0%, rgba(4,11,55,0.55) 45%, rgba(4,11,55,0.96) 100%)",
                            display: "flex",
                        }}
                    />
                </>
            ) : (
                <Background bgDataUri={bgDataUri} />
            )}

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <LogoLockup logoDataUri={logoDataUri} />
                {category ? <StatusPill label={category.toUpperCase()} /> : <div style={{ display: "flex" }} />}
            </div>

            <div style={{ display: "flex", flexDirection: "column", maxWidth: 1000 }}>
                <div
                    style={{
                        fontSize: titleSize,
                        fontWeight: 800,
                        lineHeight: 1.05,
                        letterSpacing: -1.25,
                        color: "#ffffff",
                        textShadow: "0 4px 40px rgba(4,11,55,0.6)",
                        display: "flex",
                    }}
                >
                    {title}
                </div>
                {description ? (
                    <div
                        style={{
                            fontSize: 24,
                            fontWeight: 500,
                            lineHeight: 1.35,
                            color: "#dbeaff",
                            opacity: 0.9,
                            marginTop: 18,
                            maxWidth: 925,
                            display: "flex",
                        }}
                    >
                        {description}
                    </div>
                ) : null}
            </div>

            <FooterDomain />
        </div>
    );
}
