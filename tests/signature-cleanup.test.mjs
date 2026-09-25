import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/**
 * A signature is photographed on paper, so the paper arrives with it and shows
 * as a pale box over the letterhead. The ink is lifted off its background on
 * the way in, before it can ever reach a page.
 */
test("an uploaded signature has its background removed", async () => {
  const [cleanup, route] = await Promise.all([
    read("src/lib/signature-cleanup.ts"),
    read("src/app/api/create/letterheads/[id]/upload/route.ts"),
  ]);
  assert.match(route, /kind === "signature" \|\| kind === "stamp"/);
  assert.match(route, /removeSignatureBackground/);
  // The cut is worked out per image: faint pencil and black pen differ.
  assert.match(cleanup, /chooseThreshold/);
  // A soft edge, so strokes do not turn jagged.
  assert.match(cleanup, /feather/);
  // Failure keeps the upload rather than losing it.
  assert.match(route, /keeping the image as uploaded/);
});

test("a signature drawn on screen is left exactly as it is", async () => {
  const cleanup = await read("src/lib/signature-cleanup.ts");
  assert.match(cleanup, /alreadyTransparent/);
  assert.match(cleanup, /transparentPixels > pixels \* 0\.05/);
});

test("a placed signature can be selected and removed", async () => {
  const [studio, route] = await Promise.all([
    read("src/components/create/LetterheadStudio.tsx"),
    read("src/app/api/create/letterheads/[id]/upload/route.ts"),
  ]);
  assert.match(studio, /Remove this signature/);
  assert.match(studio, /Remove this seal/);
  // A drag must not count as a click, or moving it would open the controls.
  assert.match(studio, /dragged\.current = true/);
  assert.match(route, /export async function DELETE/);
  // A shared file is only deleted when nothing else points at it.
  assert.match(route, /previous\.referenceCount <= 1/);
});
