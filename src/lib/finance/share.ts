import { CDS_BANK_ACCOUNTS } from "@/lib/finance/types";

export function invoiceBankDetailsText() {
  return CDS_BANK_ACCOUNTS.map((account) =>
    [
      account.bank,
      account.account_number,
      account.account_name,
    ].join("\n")
  ).join("\n----------------------\n");
}

export function buildInvoiceShareMessage(invoiceNumber: string | null | undefined, url: string) {
  const heading = invoiceNumber ? `Invoice ${invoiceNumber} from CDS Space` : "Invoice from CDS Space";
  return `${heading}\n\n${invoiceBankDetailsText()}\n\n${url}`;
}
