/**
 * Inter font loader for Satori (Next.js's ImageResponse).
 *
 * Primary source: the Geist TTF that ships inside Next's compiled @vercel/og
 * bundle, so ImageResponse never errors out with "No fonts are loaded".
 *
 * Local brand fonts are intentionally not used here because Satori can be
 * pickier than the browser about TTF internals during static prerendering.
 */
import fs from "node:fs";
import path from "node:path";

type OgFont = {
    name: "Inter";
    data: ArrayBuffer;
    weight: 400 | 700 | 800;
    style: "normal";
};

function toArrayBuffer(buf: Buffer): ArrayBuffer {
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    return ab;
}

function readNextFontFallback(): ArrayBuffer | null {
    try {
        const p = path.join(
            /*turbopackIgnore: true*/ process.cwd(),
            "node_modules",
            "next",
            "dist",
            "compiled",
            "@vercel",
            "og",
            "Geist-Regular.ttf",
        );
        return toArrayBuffer(fs.readFileSync(p));
    } catch {
        return null;
    }
}

/** Read a Neue Campton weight from public/font. */
function readBrandFont(file: string): ArrayBuffer | null {
    try {
        const p = path.join(
            /*turbopackIgnore: true*/ process.cwd(),
            "public",
            "font",
            "neue-campton-font-family",
            file,
        );
        return toArrayBuffer(fs.readFileSync(p));
    } catch {
        return null;
    }
}

let cached: OgFont[] | null = null;

/**
 * OG-card fonts for Satori. We keep the registered family name "Inter" (which
 * every OG card already references) but feed it the Neue Campton brand OTFs, so
 * link-preview images render in the brand typeface with zero card changes. If
 * the OTFs can't be read we fall back to Next's bundled Geist so ImageResponse
 * never errors with "No fonts are loaded".
 */
export function getOgFonts(): OgFont[] {
    if (cached) return cached;

    const regular = readBrandFont("NeueCamptonTest-Regular-BF67089b6ea9633.otf");
    const bold = readBrandFont("NeueCamptonTest-Bold-BF67089b65d3e98.otf");
    const extraBold = readBrandFont("NeueCamptonTest-ExtraBold-BF67089b6e6381f.otf");
    if (regular && bold) {
        cached = [
            { name: "Inter", data: regular, weight: 400, style: "normal" },
            { name: "Inter", data: bold, weight: 700, style: "normal" },
            { name: "Inter", data: extraBold ?? bold, weight: 800, style: "normal" },
        ];
        return cached;
    }

    const fallback = readNextFontFallback();
    if (fallback) {
        cached = [
            { name: "Inter", data: fallback, weight: 400, style: "normal" },
            { name: "Inter", data: fallback, weight: 700, style: "normal" },
            { name: "Inter", data: fallback, weight: 800, style: "normal" },
        ];
        return cached;
    }
    cached = [];
    return cached;
}
