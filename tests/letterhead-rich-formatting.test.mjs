import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("letterhead preview and export retain rich editor structure", async () => {
  const [html, pdf] = await Promise.all([
    read("src/lib/cdocs-html.ts"),
    read("src/lib/letterhead-pdf.ts"),
  ]);

  assert.match(html, /kind: "h3"/);
  assert.match(html, /kind: "blockquote"/);
  assert.match(html, /kind: "pre"/);
  assert.match(html, /if \(ctx\.fontSize\) s\.fontSize = ctx\.fontSize/);
  assert.match(html, /left\|center\|right\|justify/);
  assert.match(html, /spans\.every\(\(span\) => !span\.text/);

  assert.doesNotMatch(pdf, /plainText\(block\.spans\)/);
  assert.match(pdf, /span\.bold/);
  assert.match(pdf, /span\.italic/);
  assert.match(pdf, /span\.underline/);
  assert.match(pdf, /span\.fontSize/);
  assert.match(pdf, /block\.align/);
  assert.match(pdf, /block\.kind === "blank".*addVerticalSpace\(bodyLineHeight\)/s);
});

test("exact preview and downloaded PDF use the same document builder", async () => {
  const pdf = await read("src/lib/letterhead-pdf.ts");
  assert.match(pdf, /export async function buildLetterheadPdf/);
  assert.match(pdf, /export async function prepareLetterheadPdf[\s\S]*buildLetterheadPdf\(options\)/);
  assert.match(pdf, /export async function exportLetterheadToPdf/);
  assert.match(pdf, /preparedSource \|\| await prepareLetterheadPdf\(options\)/);
});

test("all letterhead pages reserve a footer-safe content area", async () => {
  const pdf = await read("src/lib/letterhead-pdf.ts");
  assert.match(pdf, /LETTERHEAD_CONTENT_BOTTOM_SAFE_AREA_RATIO = 0\.16/);
  assert.match(pdf, /LETTERHEAD_CONTENT_BOTTOM_MIN_MM = 48/);
  assert.match(pdf, /Math\.max\([\s\S]*LETTERHEAD_CONTENT_BOTTOM_MIN_MM[\s\S]*pageHeight \* LETTERHEAD_CONTENT_BOTTOM_SAFE_AREA_RATIO/);
  assert.match(pdf, /y \+ height > pageHeight - bottom/);
});
