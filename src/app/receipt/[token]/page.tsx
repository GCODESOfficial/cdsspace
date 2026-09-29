import type { Metadata } from "next";
import { financeDb } from "@/lib/finance/api-auth";
import ReceiptClient from "./ReceiptClient";

const SITE_URL = "https://cdsspace.pro";

type Params = Promise<{ token: string }>;

/**
 * A shared receipt link used to fall back to the site-wide card ("Home of Best
 * Brands"), which said nothing about what was being sent. The preview now
 * carries the receipt number and who it is for.
 */
async function fetchReceiptMeta(token: string) {
  try {
    const sb = financeDb();
    const columns = "receipt_number, client_name, amount, currency, paid_at";
    // The share token first, then the receipt number, so a pasted
    // /receipt/RCT-202609-7361DD70 link previews the same way.
    let { data } = await sb
      .from("finance_receipts")
      .select(columns)
      .eq("public_token", token)
      .maybeSingle();
    if (!data) {
      const { data: byNumber } = await sb
        .from("finance_receipts")
        .select(columns)
        .ilike("receipt_number", token)
        .maybeSingle();
      data = byNumber;
    }
    return data as { receipt_number: string; client_name: string; amount: number; currency: string; paid_at: string } | null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const receipt = await fetchReceiptMeta(token);
  const url = `${SITE_URL}/receipt/${token}`;

  if (!receipt) {
    return {
      title: "Payment receipt - CDS Space",
      alternates: { canonical: url },
      robots: { index: false, follow: false },
    };
  }

  const paid = receipt.paid_at
    ? new Date(receipt.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const amount = `${receipt.currency} ${Number(receipt.amount || 0).toLocaleString()}`;
  const title = `Receipt ${receipt.receipt_number} - ${receipt.client_name}`;
  const description = `Payment receipt ${receipt.receipt_number} for ${receipt.client_name} · ${amount}${paid ? ` · Paid ${paid}` : ""}.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    // A receipt names a client and an amount, so it stays out of search.
    robots: { index: false, follow: false },
    openGraph: { title, description, url, siteName: "CDS Space", type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ReceiptPage({ params }: { params: Params }) {
  const { token } = await params;
  return <ReceiptClient token={token} />;
}
