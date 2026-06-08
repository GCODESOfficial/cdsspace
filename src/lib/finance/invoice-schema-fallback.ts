const OPTIONAL_INVOICE_EXTENSION_FIELDS = [
  "payment_terms",
  "revisions_note",
  "working_hours",
  "delivery_speed",
  "delivery_period",
] as const;

type InvoiceExtensionField = (typeof OPTIONAL_INVOICE_EXTENSION_FIELDS)[number];

export function isMissingInvoiceExtensionColumn(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return OPTIONAL_INVOICE_EXTENSION_FIELDS.some(
    (field) =>
      (message.includes(`'${field}'`) || message.includes(`"${field}"`)) &&
      (message.includes("'finance_invoices'") ||
        message.includes('"finance_invoices"') ||
        message.includes("'financial_invoices'") ||
        message.includes('"financial_invoices"')),
  );
}

export function stripInvoiceExtensionFields<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload } as T & Partial<Record<InvoiceExtensionField, unknown>>;
  for (const field of OPTIONAL_INVOICE_EXTENSION_FIELDS) delete next[field];
  return next as T;
}
