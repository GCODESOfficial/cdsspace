import type { Metadata } from "next";
import { financeDb } from "@/lib/finance/api-auth";
import PublicInvoiceClient from "./PublicInvoiceClient";

const SITE_URL = "https://cdsspace.pro";

type Params = Promise<{ token: string }>;

async function fetchInvoiceMeta(token: string) {
  try {
    const sb = financeDb();
    const columns = "invoice_number, client_name, status, issue_date, due_date, total, currency, public_token";
    let { data } = await sb
      .from("finance_invoices")
      .select(columns)
      .eq("public_token", token)
      .maybeSingle();
    if (!data) {
      const { data: byNumber } = await sb
        .from("finance_invoices")
        .select(columns)
        .ilike("invoice_number", token)
        .maybeSingle();
      data = byNumber;
    }
    return data as
      | {
          invoice_number: string;
          client_name: string;
          status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
          issue_date: string;
          due_date: string | null;
          total: number;
          currency: string;
          public_token: string;
        }
      | null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const invoice = await fetchInvoiceMeta(token);
  const url = `${SITE_URL}/invoice/${token}`;

  if (!invoice) {
    return {
      title: "Invoice - CDS Space",
      alternates: { canonical: url },
      robots: { index: false, follow: false },
    };
  }

  const title = `Invoice ${invoice.invoice_number} - ${invoice.client_name}`;
  const description = `Invoice ${invoice.invoice_number} for ${invoice.client_name} · Status: ${invoice.status.toUpperCase()} · Issued ${invoice.issue_date}${invoice.due_date ? ` · Due ${invoice.due_date}` : ""}.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: false, follow: false }, // private-ish link, don't index
    openGraph: {
      title,
      description,
      url,
      siteName: "CDS Space",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function PublicInvoicePage({ params }: { params: Params }) {
  const { token } = await params;
  return <PublicInvoiceClient token={token} />;
}
