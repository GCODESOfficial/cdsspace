import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const projectRoot = process.cwd();
const publicRoot = join(projectRoot, "public");
const sourceExtensions = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);
const assetExtensions = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".ogg",
  ".png",
  ".svg",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);
const quotedPathPattern = /(["'`])(\/[^"'`\n\r]+)\1/g;
const failures = [];
const checked = new Set();

function collectSourceFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(prefix, entry.name);
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) return collectSourceFiles(fullPath, relativePath);
    return sourceExtensions.has(extname(entry.name)) ? [relativePath] : [];
  });
}

for (const relativeSourceFile of collectSourceFiles(join(projectRoot, "src"))) {
    const sourceFile = join("src", relativeSourceFile);
    const source = readFileSync(join(projectRoot, sourceFile), "utf8");

    for (const match of source.matchAll(quotedPathPattern)) {
      const rawPath = match[2].split(/[?#]/, 1)[0];
      let assetPath;

      try {
        assetPath = decodeURIComponent(rawPath);
      } catch {
        failures.push(`${sourceFile}: invalid URL encoding in ${rawPath}`);
        continue;
      }

      if (!assetExtensions.has(extname(assetPath).toLowerCase())) continue;

      const publicFile = join(publicRoot, assetPath.slice(1));
      const checkKey = `${sourceFile}\0${assetPath}`;
      if (checked.has(checkKey)) continue;
      checked.add(checkKey);

      if (!existsSync(publicFile)) {
        failures.push(`${sourceFile}: missing public asset ${assetPath}`);
        continue;
      }

      if (statSync(publicFile).size === 0) {
        failures.push(`${sourceFile}: empty public asset ${assetPath}`);
      }
    }
}

if (failures.length > 0) {
  console.error("Static asset validation failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Static asset validation passed (${checked.size} references checked).`);
