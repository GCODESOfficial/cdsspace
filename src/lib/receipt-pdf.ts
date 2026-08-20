import type { FinanceReceipt } from "@/lib/finance/types";

export async function exportReceiptToPdf(receipt: FinanceReceipt) {
  if (!receipt.invoice) throw new Error("The invoice details required for this receipt are unavailable.");
  const { exportInvoiceToPdf } = await import("@/lib/invoice-pdf");
  await exportInvoiceToPdf(receipt.invoice, receipt.items || [], { receipt, bankAccounts: [] });
}
