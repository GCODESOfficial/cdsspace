// Generates the CDS Space branded pixel-art 3D arrow cursor.
//
// Source of truth for the cursor art. Re-run with `node scripts/build-cursor.mjs`
// to regenerate the PNGs in public/cursors after tweaking colours/geometry.
//
// We render to PNG (not ship the SVG directly) because Safari/WebKit does not
// support SVG `cursor:` images, while PNG cursors are supported everywhere.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

// ── Brand palette ─────────────────────────────────────────────────────────
const FACE = "#F5F5F5"; // white top face
const GRID = "#AFC2F2"; // light-blue pixel gridlines on the face
const BLUE = "#1C4ED1"; // brand blue - border + 3D sides
const BLUE_DARK = "#123491"; // deeper blue for the extrusion shadow side
const NAVY = "#040B37"; // darkest edge

// ── Arrow geometry (classic pointer), tip at P1, padding applied ──────────
const PAD = 4;
const S = 4.2; // scale of the base 14-unit-tall arrow
const pts = [
  [0, 0],     // tip (hotspot)
  [0, 14],    // bottom of left edge
  [3.6, 10.6],// inner notch (left)
  [5.7, 15.7],// tail bottom-left
  [7.9, 14.8],// tail bottom-right
  [5.9, 9.8], // inner notch (right)
  [10.2, 9.8],// right shoulder
].map(([x, y]) => [x * S + PAD, y * S + PAD]);

const poly = (offX = 0, offY = 0) =>
  pts.map(([x, y]) => `${(x + offX).toFixed(2)},${(y + offY).toFixed(2)}`).join(" ");

const DEPTH = 6; // 3D extrusion depth (down-right)

// Build the stacked extrusion (back→front) so the body reads as a solid 3D block.
let sides = "";
for (let d = DEPTH; d >= 1; d--) {
  const t = d / DEPTH; // 1 at the back, →0 at the front
  const col = t > 0.55 ? NAVY : BLUE_DARK;
  sides += `<polygon points="${poly(d, d)}" fill="${col}"/>`;
}

const maxX = Math.max(...pts.map((p) => p[0])) + DEPTH + PAD;
const maxY = Math.max(...pts.map((p) => p[1])) + DEPTH + PAD;
const vbW = Math.ceil(maxX);
const vbH = Math.ceil(maxY);

// Hollow arrow: the 3D body is masked so only the down-right extrusion sliver
// shows (the front face is punched out → transparent interior). Faint gridlines
// keep the "made of cubes" feel without an opaque white fill.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}">
  <defs>
    <pattern id="px" width="8.4" height="8.4" patternUnits="userSpaceOnUse" patternTransform="translate(${PAD} ${PAD})">
      <path d="M8.4 0V8.4M0 8.4H8.4" stroke="${GRID}" stroke-width="1" stroke-opacity="0.6"/>
    </pattern>
    <clipPath id="face"><polygon points="${poly()}"/></clipPath>
    <mask id="cut">
      <rect width="${vbW}" height="${vbH}" fill="white"/>
      <polygon points="${poly()}" fill="black"/>
    </mask>
  </defs>
  <g mask="url(#cut)">${sides}</g>
  <g clip-path="url(#face)"><rect width="${vbW}" height="${vbH}" fill="url(#px)"/></g>
  <polygon points="${poly()}" fill="none" stroke="${BLUE}" stroke-width="3.2" stroke-linejoin="round"/>
</svg>`;

writeFileSync(new URL("../public/cursors/cursor.svg", import.meta.url), svg);

// Hotspot = the arrow tip (P1) in raster pixels, for each target width.
async function render(name, width) {
  const height = Math.round((width / vbW) * vbH);
  await sharp(Buffer.from(svg)).resize({ width, height }).png().toFile(
    new URL(`../public/cursors/${name}`, import.meta.url).pathname,
  );
  const hot = Math.round((PAD / vbW) * width);
  console.log(`${name}: ${width}x${height}  hotspot=${hot},${hot}`);
}

// 32px-tall cursor. viewBox is 57×80, so width 23 → height 32.
await render("cursor.png", 23);    // 1x default cursor (~32px tall)
await render("cursor@2x.png", 46); // retina source if needed
console.log(`viewBox ${vbW}x${vbH}`);
