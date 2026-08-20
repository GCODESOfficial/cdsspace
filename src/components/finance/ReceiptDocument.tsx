"use client";

import InvoiceDocument from "@/components/finance/InvoiceDocument";
import type { FinanceReceipt } from "@/lib/finance/types";

export default function ReceiptDocument({ receipt }: { receipt: FinanceReceipt }) {
  if (!receipt.invoice) return null;
  return <InvoiceDocument invoice={receipt.invoice} items={receipt.items || []} receipt={receipt} bankAccounts={[]} />;
}
