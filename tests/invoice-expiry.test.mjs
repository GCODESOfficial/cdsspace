import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("a new invoice is stamped with a 28 day expiry", async () => {
  const [expiry, route] = await Promise.all([
    read("src/lib/finance/invoice-expiry.ts"),
    read("src/app/api/admin/finance/invoices/route.ts"),
  ]);
  assert.match(expiry, /INVOICE_VALID_DAYS = 28/);
  assert.match(route, /auto_cancel_at/);
  assert.match(route, /INVOICE_VALID_DAYS \* 24 \* 60 \* 60 \* 1000/);
});

test("the sweep leaves older invoices and part-paid invoices alone", async () => {
  const sweep = await read("src/lib/finance/invoice-auto-cancel.ts");
  // Invoices raised before the rule carry no expiry date and must never be touched.
  assert.match(sweep, /auto_cancel_at is not null/);
  assert.match(sweep, /status in \('draft', 'sent'\)/);
  // Money already sent means a live arrangement, not an abandoned quote.
  assert.match(sweep, /Number\(invoice\.amount_paid \|\| 0\) <= 0/);
  // A cancelled invoice owes nothing, which is what keeps outstanding honest.
  assert.match(sweep, /balance_due = 0/);
});

test("the client is told how long the invoice is valid", async () => {
  const page = await read("src/app/invoice/[token]/PublicInvoiceClient.tsx");
  assert.match(page, /This invoice is valid until/);
  assert.match(page, /We kindly ask that/);
  assert.match(page, /we will be happy to help/);
  assert.doesNotMatch(page, /cancelled automatically/);
  assert.doesNotMatch(page, /new invoice to proceed/);
  assert.match(page, /expired on/);
});
