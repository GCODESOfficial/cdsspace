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

let cached: OgFont[] | null = null;

export function getOgFonts(): OgFont[] {
    if (cached) return cached;
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
