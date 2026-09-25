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

test("completed company stationery collapses behind an accessible show control", async () => {
  const studio = await read("src/components/admin/executive-board/CompanyLetterheadStudio.tsx");
  assert.match(studio, /setStationeryOpen\(!\(payload\.hasFirstPage && payload\.hasSecondPage\)\)/);
  assert.match(studio, /aria-controls="company-stationery-details"/);
  assert.match(studio, /Show stationery/);
  assert.match(studio, /Hide stationery/);
  assert.match(studio, /!complete \|\| stationeryOpen/);
});

test("Executive Board letters always use the official company and sender identity", async () => {
  const [library, updateRoute, refineRoute] = await Promise.all([
    read("src/lib/create-platform/letterheads.ts"),
    read("src/app/api/create/letterheads/[id]/route.ts"),
    read("src/app/api/create/letterheads/[id]/refine/route.ts"),
  ]);
  assert.match(library, /companyShort: "CDS Space"/);
  assert.match(library, /companyFull: "CDS Space Branding Agency LTD"/);
  assert.match(library, /senderName: "Chris O\. John"/);
  assert.match(library, /scope === "executive_board" \? applyExecutiveBoardIdentity/);
  assert.match(library, /actor_email, scope, title, body_html/);
  assert.match(updateRoute, /updateLetterhead\(auth\.actor, auth\.id, body, current\.scope\)/);
  assert.match(refineRoute, /Never output placeholders/);
  assert.match(refineRoute, /applyExecutiveBoardIdentity\(refinedHtml\)/);
});

test("saved letterhead cards provide a confirmed delete action", async () => {
  const studio = await read("src/components/create/LetterheadStudio.tsx");
  assert.match(studio, /async function deleteLetterhead\(source: Letterhead\)/);
  assert.match(studio, /Delete “\$\{source\.title\}”\?/);
  assert.match(studio, /method: "DELETE"/);
  assert.match(studio, /<Trash2[^>]*\/>\}Delete\s*<\/button>/s);
});

test("saved letterhead cards preview the opening document content", async () => {
  const studio = await read("src/components/create/LetterheadStudio.tsx");
  assert.match(studio, /function SavedLetterheadPreview/);
  assert.match(studio, /new IntersectionObserver/);
  assert.match(studio, /buildLetterheadPdf\(\{ \.\.\.item, signatureUrl: null \}/);
  assert.match(studio, /pdf\.getPage\(1\)/);
  assert.match(studio, /<SavedLetterheadPreview item=\{item\} \/>/);
});
