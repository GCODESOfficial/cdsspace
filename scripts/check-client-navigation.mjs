import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOTS = ["src/app", "src/components"];
const SOURCE_EXTENSIONS = new Set([".jsx", ".tsx"]);
const violations = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(filePath);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;

    const source = await readFile(filePath, "utf8");
    for (const match of source.matchAll(/<a\b(?!\.)[^>]*>/gs)) {
      const tag = match[0];
      if (/\bdownload(?:\s|=|>)/.test(tag)) continue;

      const hrefMatch = tag.match(/\bhref\s*=\s*(?:["']([^"']+)|\{\s*(["'`])([\s\S]*?)\2\s*\})/);
      const href = hrefMatch?.[1] || hrefMatch?.[3];
      if (!href?.startsWith("/") || href === "/api" || href.startsWith("/api/")) continue;

      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${filePath}:${line} uses a raw anchor for internal route ${href}`);
    }
  }
}

await Promise.all(ROOTS.map(walk));

if (violations.length) {
  console.error("Internal application routes must use next/link so navigation stays client-side:\n");
  console.error(violations.map((violation) => `- ${violation}`).join("\n"));
  process.exit(1);
}

console.log("Client navigation check passed.");
