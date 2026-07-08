// Compress all raster images in a directory (default: public) with sharp.
//
//   node scripts/compress-raster.mjs [dir] [--dry-run]
//
// Re-encodes in place, KEEPING the original format/extension (so every <img src>
// keeps working) and the original pixel dimensions. Lossy but high-quality:
//   - jpg/jpeg -> mozjpeg q80
//   - png      -> palette quantization q90 (libimagequant) + max zlib
//   - webp     -> q80
// EXIF orientation is baked into pixels (.rotate()) before metadata is stripped,
// so appearance is preserved. Writes back only when the result is smaller.
// Lossy - originals are recoverable via git.
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "public");
const dryRun = process.argv.includes("--dry-run");

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && /\.(png|jpe?g|webp)$/i.test(e.name)) yield full;
  }
}

const fmt = (b) =>
  b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : b >= 1024 ? (b / 1024).toFixed(1) + " KB" : b + " B";

let files = 0, changed = 0, failed = 0, before = 0, after = 0;
const savings = [];

for await (const file of walk(root)) {
  files++;
  const size = (await fs.stat(file)).size;
  before += size;
  const ext = path.extname(file).toLowerCase();
  try {
    const pipeline = sharp(await fs.readFile(file), { failOn: "none" }).rotate(); // bake EXIF orientation
    let out;
    if (ext === ".jpg" || ext === ".jpeg") out = await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    else if (ext === ".png") out = await pipeline.png({ quality: 90, palette: true, compressionLevel: 9, effort: 8 }).toBuffer();
    else out = await pipeline.webp({ quality: 80 }).toBuffer();

    if (out.length < size) {
      if (!dryRun) await fs.writeFile(file, out);
      changed++;
      after += out.length;
      savings.push({ file: path.relative(process.cwd(), file), inBytes: size, outBytes: out.length, saved: size - out.length });
    } else {
      after += size; // re-encode didn't help - keep the original
    }
  } catch (err) {
    failed++;
    after += size;
    console.warn(`  skip (error) ${path.relative(process.cwd(), file)}: ${err?.message ?? err}`);
  }
}

savings.sort((a, b) => b.saved - a.saved);
console.log("\nTop savings:");
for (const s of savings.slice(0, 12)) {
  console.log(
    `  ${fmt(s.inBytes).padStart(9)} -> ${fmt(s.outBytes).padStart(9)}  -${Math.round((100 * s.saved) / s.inBytes)}%  ${s.file}`,
  );
}
const pct = before ? ((100 * (before - after)) / before).toFixed(1) : "0";
console.log(`\n${dryRun ? "[dry-run] " : ""}${files} images · ${changed} compressed · ${failed} skipped`);
console.log(`Total: ${fmt(before)} -> ${fmt(after)}   (${pct}% smaller, ${fmt(before - after)} saved)`);
