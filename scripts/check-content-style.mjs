import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const allowedExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mdx",
  ".mjs",
  ".scss",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const forbiddenForms = [
  { label: "Unicode U+2014", value: String.fromCodePoint(0x2014) },
  { label: "named HTML entity", value: ["&", "mdash", ";"].join("") },
  { label: "numeric HTML entity", value: ["&#", "8212", ";"].join("") },
  { label: "JavaScript Unicode escape", value: ["\\", "u", "2014"].join("") },
  { label: "Unicode code-point escape", value: ["\\", "u", "{2014}"].join("") },
];

function isIgnored(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const segments = normalized.split("/");
  return (
    segments.includes("node_modules") ||
    segments.includes(".git") ||
    segments.some((segment) => segment === ".next" || segment.startsWith(".next-")) ||
    segments.some((segment) => segment === ".tmpbuild" || segment.startsWith(".tmpbuild-")) ||
    segments.includes("coverage") ||
    normalized === "public/uploads" ||
    normalized.startsWith("public/uploads/")
  );
}

async function collectFiles(directory, files = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath);
    if (isIgnored(relativePath)) continue;
    if (entry.isDirectory()) {
      await collectFiles(absolutePath, files);
      continue;
    }
    if (allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push({ absolutePath, relativePath });
    }
  }
  return files;
}

const violations = [];
const directNativeShareNeedle = ["navigator", ".share"].join("");
const universalShareComponent = "src/components/share/UniversalShareButton.tsx";
for (const file of await collectFiles(root)) {
  const content = await readFile(file.absolutePath, "utf8");
  const lines = content.split(/\r?\n/u);
  lines.forEach((line, index) => {
    forbiddenForms.forEach((form) => {
      if (line.includes(form.value)) {
        violations.push(`${file.relativePath}:${index + 1} contains ${form.label}`);
      }
    });
  });
  const normalizedPath = file.relativePath.split(path.sep).join("/");
  if (normalizedPath !== universalShareComponent && content.includes(directNativeShareNeedle)) {
    const line = content.slice(0, content.indexOf(directNativeShareNeedle)).split(/\r?\n/u).length;
    violations.push(`${file.relativePath}:${line} bypasses the universal share system`);
  }
}

if (violations.length > 0) {
  console.error("Content style check failed. Replace the forbidden punctuation with a comma, colon, parentheses, or a full stop.");
  violations.forEach((violation) => console.error(`  ${violation}`));
  process.exit(1);
}

console.log("Content style check passed.");
