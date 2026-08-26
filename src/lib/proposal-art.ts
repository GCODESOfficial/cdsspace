import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  PROPOSAL_ART,
  SLIDE_SOURCE_HEIGHT,
  SLIDE_SOURCE_WIDTH,
  type ProposalArtKey,
} from "@/lib/proposal-deck";

/**
 * Rasterizes the proposal deck artwork for the PDF export.
 *
 * The web deck shows these SVGs directly; jsPDF cannot draw SVG, which is why
 * the exported PDF came out with no illustrations at all. Here we render the
 * same artwork with sharp and hand jsPDF a PNG, so print and screen match.
 *
 * Standalone artwork is rendered whole. A cropped entry is rendered by laying
 * out the full slide first and extracting its window, which is what keeps the
 * source slide's own footer and page-number badge out of the result.
 *
 * Rendering happens at 2x the placement size and results are cached for the
 * lifetime of the process - the source files never change at runtime.
 */

// Render at 2x so artwork still has enough pixels once scaled into the slide.
const RENDER_SCALE = 2;

const cache = new Map<string, Buffer>();

function sourcePath(file: string) {
  return path.join(process.cwd(), "public", file);
}

/**
 * @param key       artwork to render
 * @param boxWidth  placement width in PDF points
 * @param boxHeight placement height in PDF points
 */
export async function renderProposalArt(
  key: ProposalArtKey,
  boxWidth: number,
  boxHeight: number,
): Promise<Buffer | null> {
  const cacheKey = `${key}:${Math.round(boxWidth)}x${Math.round(boxHeight)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const art = PROPOSAL_ART[key];
  const targetWidth = Math.max(1, Math.round(boxWidth * RENDER_SCALE));
  const targetHeight = Math.max(1, Math.round(boxHeight * RENDER_SCALE));

  try {
    const svg = await readFile(sourcePath(art.src));
    const crop = "crop" in art ? art.crop : undefined;

    if (!crop) {
      // Standalone artwork: render it whole. The caller sizes the box to the
      // artwork's own aspect ratio, so `fill` cannot distort anything.
      const out = await sharp(svg, { density: 96 })
        .resize(targetWidth, targetHeight, { fit: "fill", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      cache.set(cacheKey, out);
      return out;
    }

    const full = await sharp(svg, { density: 96 })
      .resize(SLIDE_SOURCE_WIDTH * RENDER_SCALE, SLIDE_SOURCE_HEIGHT * RENDER_SCALE, { fit: "fill" })
      .png()
      .toBuffer();

    // Clamp the window so a bad constant can never ask sharp for pixels that
    // sit outside the artboard.
    const left = Math.max(0, Math.round(crop.x * RENDER_SCALE));
    const top = Math.max(0, Math.round(crop.y * RENDER_SCALE));
    const width = Math.min(SLIDE_SOURCE_WIDTH * RENDER_SCALE - left, Math.round(art.w * RENDER_SCALE));
    const height = Math.min(SLIDE_SOURCE_HEIGHT * RENDER_SCALE - top, Math.round(art.h * RENDER_SCALE));
    if (width <= 0 || height <= 0) return null;

    const out = await sharp(full)
      .extract({ left, top, width, height })
      .resize(targetWidth, targetHeight, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .toBuffer();

    cache.set(cacheKey, out);
    return out;
  } catch (error) {
    // Artwork is decorative. A missing or unreadable file must never take the
    // whole proposal download down with it.
    console.error("[proposal-art] could not render", key, error);
    return null;
  }
}
