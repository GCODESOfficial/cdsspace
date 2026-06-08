// Compress all .svg files in a directory (default: public) with SVGO.
//
//   node scripts/compress-svgs.mjs [dir] [--dry-run]
//
// Optimizes in place, writing back only when the result is smaller. viewBox is
// preserved (SVGO's default removes it, which breaks responsive scaling), so the
// optimization is render-safe. Prints per-file top savers + a total before/after.
import { promises as fs } from "node:fs";
import path from "node:path";
import { optimize } from "svgo";

const root = path.resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "public");
const dryRun = process.argv.includes("--dry-run");

const baseConfig = {
  // viewBox kept so SVGs stay responsive; everything else from the safe default.
  plugins: [{ name: "preset-default", params: { overrides: { removeViewBox: false } } }],
};

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && full.toLowerCase().endsWith(".svg")) yield full;
  }
}

const fmt = (b) =>
  b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : b >= 1024 ? (b / 1024).toFixed(1) + " KB" : b + " B";

let files = 0, changed = 0, failed = 0, before = 0, after = 0;
const savings = [];

for await (const file of walk(root)) {
  files++;
  const input = await fs.readFile(file, "utf8");
  const inBytes = Buffer.byteLength(input);
  before += inBytes;
  try {
    // multipass helps small/medium files; skip it on huge embedded-raster SVGs
    // where it only burns time for no gain.
    const multipass = inBytes < 2_000_000;
    const result = optimize(input, { path: file, multipass, ...baseConfig });
    const outBytes = Buffer.byteLength(result.data);
    if (outBytes < inBytes) {
      if (!dryRun) await fs.writeFile(file, result.data);
      changed++;
      after += outBytes;
      savings.push({ file: path.relative(process.cwd(), file), inBytes, outBytes, saved: inBytes - outBytes });
    } else {
      after += inBytes; // no improvement — leave the original untouched
    }
  } catch (err) {
    failed++;
    after += inBytes;
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
console.log(`\n${dryRun ? "[dry-run] " : ""}${files} SVGs · ${changed} optimized · ${failed} skipped`);
console.log(`Total: ${fmt(before)} -> ${fmt(after)}   (${pct}% smaller, ${fmt(before - after)} saved)`);
