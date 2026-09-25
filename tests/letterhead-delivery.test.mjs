import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/**
 * The asset size columns on create_letterheads are not-null with a default of
 * 0. Delivering a letterhead that had no second page or no signature passed
 * null for those, and the insert was rejected, so nothing reached the client.
 */
test("a letterhead with no second page or signature still delivers", async () => {
  const source = await read("src/lib/letterhead-delivery.ts");
  for (const asset of ["first_page", "second_page", "signature"]) {
    const pattern = new RegExp(`copied\\.get\\("${asset}"\\)\\?\\.size \\?\\? 0`);
    assert.match(source, pattern, `${asset} size must fall back to 0, never null`);
  }
  assert.doesNotMatch(source, /\?\.size \|\| null/);
});

test("a delivered letterhead lands where the client's studio looks", async () => {
  const [delivery, library] = await Promise.all([
    read("src/lib/letterhead-delivery.ts"),
    read("src/lib/create-platform/letterheads.ts"),
  ]);
  // The client studio lists the "create" scope, so a delivery must carry it.
  assert.match(delivery, /'client',\$2,\$3,'create'/);
  assert.match(library, /scope = \$3/);
  // It is the client's own copy, tagged as delivered rather than uploaded.
  assert.match(delivery, /delivered_by_cds/);
});
