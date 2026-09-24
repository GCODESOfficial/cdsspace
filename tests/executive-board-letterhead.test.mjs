import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Executive Board letters use one company letterhead, not a per-document upload", async () => {
  const [studio, page] = await Promise.all([
    read("src/components/create/LetterheadStudio.tsx"),
    read("src/components/admin/executive-board/CompanyLetterheadStudio.tsx"),
  ]);
  assert.match(studio, /lockedLetterhead/);
  // The design controls are hidden in this mode: there is nothing to choose.
  assert.match(studio, /CDS Space letterhead applied/);
  assert.match(page, /scope="executive_board"/);
  assert.match(page, /lockedLetterhead/);
});

test("the two studios keep separate documents", async () => {
  const [lib, route] = await Promise.all([
    read("src/lib/create-platform/letterheads.ts"),
    read("src/app/api/create/letterheads/route.ts"),
  ]);
  assert.match(lib, /scope = \$3/);
  assert.match(lib, /export type LetterheadScope/);
  // Company correspondence is admin only.
  assert.match(route, /Executive Board letterheads are admin only/);
  assert.match(route, /applyCompanyLetterhead/);
});

test("each document keeps its own copy of the company design", async () => {
  const company = await read("src/lib/create-platform/company-letterhead.ts");
  // Copied in, so replacing the company letterhead cannot rewrite old letters.
  assert.match(company, /download\(path\)/);
  assert.match(company, /updateLetterheadAsset/);
  assert.match(company, /has_second_page = true/);
});

test("company stationery exposes separate first and continuation page controls", async () => {
  const [studio, route, assetRoute] = await Promise.all([
    read("src/components/admin/executive-board/CompanyLetterheadStudio.tsx"),
    read("src/app/api/admin/executive-board/letterhead/route.ts"),
    read("src/app/api/admin/executive-board/letterhead/asset/[page]/route.ts"),
  ]);
  assert.match(studio, /First-page letterhead/);
  assert.match(studio, /Continuation letterhead/);
  assert.match(studio, /Page 2 and later/);
  assert.match(route, /form\?\.get\("page"\) === "second"/);
  assert.match(assetRoute, /executive_board\.view/);
  assert.match(assetRoute, /Cache-Control.*private, no-store/);
});
