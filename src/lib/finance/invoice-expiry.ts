/**
 * How long a new invoice stays valid.
 *
 * An unpaid invoice used to stay open indefinitely, so the outstanding figure
 * carried quotes nobody intended to pay. New invoices now expire, the date is
 * shown to the client on the invoice itself, and a daily sweep cancels the
 * ones that pass it unpaid.
 */
export const INVOICE_VALID_DAYS = 28;

export function invoiceExpiryLabel(autoCancelAt: string | null | undefined) {
  if (!autoCancelAt) return null;
  return new Date(autoCancelAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function invoiceHasExpired(autoCancelAt: string | null | undefined) {
  return Boolean(autoCancelAt) && new Date(autoCancelAt as string).getTime() <= Date.now();
}
