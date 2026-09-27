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

test("letterhead documents offer wide and small bottom margins", async () => {
  const [migration, library, studio, pdf] = await Promise.all([
    read("glashdb/migrations/20260925_letterhead_margin_and_stamp.sql"),
    read("src/lib/create-platform/letterheads.ts"),
    read("src/components/create/LetterheadStudio.tsx"),
    read("src/lib/letterhead-pdf.ts"),
  ]);
  assert.match(migration, /bottom_margin text not null default 'wide'/);
  assert.match(library, /bottomMargin: row\.bottom_margin === "small" \? "small" : "wide"/);
  assert.match(studio, /<option value="wide">Wide margin<\/option>/);
  assert.match(studio, /<option value="small">Small margin<\/option>/);
  assert.match(pdf, /LETTERHEAD_CONTENT_BOTTOM_SMALL_MIN_MM = 24/);
  assert.match(pdf, /options\.bottomMargin === "small"/);
});

test("stamps are private, draggable, previewed, and exported with letterheads", async () => {
  const [migration, library, upload, asset, studio, pdf, delivery] = await Promise.all([
    read("glashdb/migrations/20260925_letterhead_margin_and_stamp.sql"),
    read("src/lib/create-platform/letterheads.ts"),
    read("src/app/api/create/letterheads/[id]/upload/route.ts"),
    read("src/app/api/create/letterheads/[id]/asset/[kind]/route.ts"),
    read("src/components/create/LetterheadStudio.tsx"),
    read("src/lib/letterhead-pdf.ts"),
    read("src/lib/letterhead-delivery.ts"),
  ]);
  assert.match(migration, /stamp_path text/);
  assert.match(library, /assetUrl\(actor, row\.id, "stamp"/);
  assert.match(upload, /kind !== "stamp"/);
  assert.match(asset, /stamp: "stamp_path"/);
  assert.match(studio, /Company stamp \/ seal/);
  assert.match(studio, /function DraggableStamp/);
  assert.match(pdf, /includeStamp/);
  assert.match(pdf, /doc\.addImage\(stamp\.dataUrl/);
  assert.match(delivery, /\["stamp", source\.stamp_path/);
});

test("configured letterhead and signing controls collapse while retaining edit access", async () => {
  const studio = await read("src/components/create/LetterheadStudio.tsx");
  assert.match(studio, /Configure letterhead/);
  assert.match(studio, /setLetterheadConfigOpen\(false\)/);
  assert.match(studio, /Configure signatures and seal/);
  assert.match(studio, /setSigningConfigOpen\(false\)/);
  assert.match(studio, /aria-expanded=\{letterheadConfigOpen\}/);
  assert.match(studio, /aria-expanded=\{signingConfigOpen\}/);
});

test("letterheads support several private signatures and secure signer invitations", async () => {
  const [migration, library, studio, upload, sign, asset, pdf, delivery] = await Promise.all([
    read("glashdb/migrations/20260925_letterhead_multiple_signatures.sql"),
    read("src/lib/create-platform/letterheads.ts"),
    read("src/components/create/LetterheadStudio.tsx"),
    read("src/app/api/create/letterheads/[id]/signatures/route.ts"),
    read("src/app/api/letterhead-sign/[token]/route.ts"),
    read("src/app/api/create/letterheads/[id]/signatures/[signatureId]/asset/route.ts"),
    read("src/lib/letterhead-pdf.ts"),
    read("src/lib/letterhead-delivery.ts"),
  ]);

  assert.match(migration, /create table if not exists public\.create_letterhead_signatures/);
  assert.match(migration, /access_token uuid unique default gen_random_uuid\(\)/);
  assert.match(migration, /enable row level security/);
  assert.match(library, /listLetterheadSignatures/);
  assert.match(studio, /type="file" multiple/);
  assert.match(studio, /Invite another person to sign/);
  assert.match(studio, /<UniversalShareButton/);
  assert.match(upload, /source, signer_name, signer_email, status/);
  assert.match(upload, /fromName: "CDS Space cSign"/);
  assert.match(sign, /source = 'invitation'/);
  assert.match(sign, /status: "signed"/);
  assert.match(asset, /isCreatePrivateAssetPath/);
  assert.match(asset, /Cache-Control": "private, no-store/);
  assert.match(pdf, /additionalSignatures/);
  assert.match(delivery, /additionalSignatures/);
});

test("signatures can be removed explicitly and saved in a private named library", async () => {
  const [migration, libraryApi, libraryAsset, libraryDelete, removeAll, removeOne, studio, storage] = await Promise.all([
    read("glashdb/migrations/20260925_create_saved_signatures.sql"),
    read("src/app/api/create/signatures/route.ts"),
    read("src/app/api/create/signatures/[id]/asset/route.ts"),
    read("src/app/api/create/signatures/[id]/route.ts"),
    read("src/app/api/create/letterheads/[id]/signatures/route.ts"),
    read("src/app/api/create/letterheads/[id]/signatures/[signatureId]/route.ts"),
    read("src/components/create/LetterheadStudio.tsx"),
    read("src/lib/client-storage.ts"),
  ]);

  assert.match(migration, /create table if not exists public\.create_saved_signatures/);
  assert.match(migration, /owner_kind, owner_id, lower\(name\)/);
  assert.match(migration, /enable row level security/);
  assert.match(libraryApi, /action === "save"/);
  assert.match(libraryApi, /action === "apply"/);
  assert.match(libraryApi, /signature-library/);
  assert.match(libraryAsset, /isCreatePrivateAssetPath/);
  assert.match(libraryAsset, /private, no-store/);
  assert.match(libraryDelete, /set deleted_at = now\(\)/);
  assert.match(removeAll, /Remove every signature from one document/);
  assert.match(removeOne, /delete from public\.create_letterhead_signatures/);
  assert.match(studio, /Remove all signatures/);
  assert.match(studio, /Saved signatures/);
  assert.match(studio, /Save signature for later/);
  assert.match(storage, /from public\.create_saved_signatures/);
});

test("account-free invitees preview the exact letterhead and can place only their own signature", async () => {
  const [signApi, publicAsset, signingPage, studio] = await Promise.all([
    read("src/app/api/letterhead-sign/[token]/route.ts"),
    read("src/app/api/letterhead-sign/[token]/asset/[kind]/route.ts"),
    read("src/app/letterhead-sign/[token]/page.tsx"),
    read("src/components/create/LetterheadStudio.tsx"),
  ]);

  assert.match(signApi, /firstPageUrl: asset\("firstPage"/);
  assert.match(signApi, /signature_x: signatureX/);
  assert.match(signApi, /signature_page: signaturePage/);
  assert.match(publicAsset, /signature\.access_token = \$1::uuid/);
  assert.match(publicAsset, /isCreatePrivateAssetPath/);
  assert.match(publicAsset, /Cache-Control": "private, no-store/);
  assert.match(signingPage, /buildLetterheadPdf\(previewSource/);
  assert.match(signingPage, /signatures: \[\]/);
  assert.match(signingPage, /No account is required/);
  assert.match(signingPage, /type="file" accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(signingPage, /function SignerPlacement/);
  assert.match(signingPage, /Submit positioned signature/);
  assert.match(studio, /window\.setInterval\(\(\) => void sync\(\), 4000\)/);
});

test("Create Studio overview includes recent letterhead documents", async () => {
  const createApp = await read("src/components/create/CreateApp.tsx");
  assert.match(createApp, /loadRecentLetterheads/);
  assert.match(createApp, /recentOverview/);
  assert.match(createApp, /function LetterheadRecentCard/);
  assert.match(createApp, /Open in letterhead studio/);
  assert.match(createApp, /setRequestedLetterheadId\(item\.letterhead\.id\)/);
});

test("letterhead card and exact previews use a private versioned browser cache", async () => {
  const studio = await read("src/components/create/LetterheadStudio.tsx");
  assert.match(studio, /cds-private-letterhead-previews-v1/);
  assert.match(studio, /window\.crypto\.subtle\.digest\("SHA-256"/);
  assert.match(studio, /readCachedPreview\(cacheBase\)/);
  assert.match(studio, /cachePreview\(cacheBase, \[previewBlob\]\)/);
  assert.match(studio, /cachePreview\(cacheBase, generatedBlobs\)/);
  assert.match(studio, /PREVIEW_CACHE_TTL_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(studio, /firstPageUrl: item\.firstPageUrl/);
  assert.match(studio, /bottomMargin: item\.bottomMargin/);
});

test("the mobile writing toolbar stays on one horizontally scrollable row", async () => {
  const editor = await read("src/components/cdocs/rich-doc-editor.tsx");
  assert.match(editor, /flex-nowrap/);
  assert.match(editor, /overflow-x-auto/);
  assert.match(editor, /overscroll-x-contain/);
  assert.match(editor, /sm:flex-wrap/);
  assert.match(editor, /<ViewportPortal>/);
});
