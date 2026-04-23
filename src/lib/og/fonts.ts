/**
 * Inter font loader for Satori (Next.js's ImageResponse).
 *
 * Primary source: `@fontsource/inter` WOFF files shipped in node_modules.
 * Satori accepts TTF / OTF / plain WOFF (not WOFF2), and the fontsource
 * package conveniently bundles both — we read the .woff variants so the
 * build is fully offline-deterministic.
 *
 * Fallback: the Noto Sans TTF that ships inside @vercel/og itself, so
 * ImageResponse never errors out with "No fonts are loaded".
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

function readInterWoff(weight: 400 | 700 | 800): OgFont | null {
    try {
        const p = path.join(
            process.cwd(),
            "node_modules",
            "@fontsource",
            "inter",
            "files",
            `inter-latin-${weight}-normal.woff`,
        );
        const buf = fs.readFileSync(p);
        return { name: "Inter", data: toArrayBuffer(buf), weight, style: "normal" };
    } catch {
        return null;
    }
}

function readNotoSansFallback(): ArrayBuffer | null {
    try {
        const p = path.join(
            process.cwd(),
            "node_modules",
            "next",
            "dist",
            "compiled",
            "@vercel",
            "og",
            "noto-sans-v27-latin-regular.ttf",
        );
        return toArrayBuffer(fs.readFileSync(p));
    } catch {
        return null;
    }
}

let cached: OgFont[] | null = null;

export function getOgFonts(): OgFont[] {
    if (cached) return cached;
    const inter = [readInterWoff(400), readInterWoff(700), readInterWoff(800)]
        .filter((x): x is OgFont => !!x);
    if (inter.length > 0) {
        cached = inter;
        return cached;
    }
    const fallback = readNotoSansFallback();
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
