import type { Metadata } from "next";
import { financeDb } from "@/lib/finance/api-auth";
import PublicQuotationClient from "./PublicQuotationClient";

const SITE_URL = "https://cdsspace.pro";

type Params = Promise<{ token: string }>;

async function fetchQuotationMeta(token: string) {
  try {
    const sb = financeDb();
    const columns = "quotation_number, project_name, client_name, status, issue_date, valid_until, total, currency, public_token";
    let { data } = await sb
      .from("finance_quotations")
      .select(columns)
      .eq("public_token", token)
      .maybeSingle();
    if (!data) {
      const { data: byNumber } = await sb
        .from("finance_quotations")
        .select(columns)
        .ilike("quotation_number", token)
        .maybeSingle();
      data = byNumber;
    }
    return data as
      | {
          quotation_number: string;
          project_name: string;
          client_name: string;
          status: "draft" | "sent" | "accepted" | "converted" | "cancelled";
          issue_date: string;
          valid_until: string | null;
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
  const quotation = await fetchQuotationMeta(token);
  const url = `${SITE_URL}/quotation/${token}`;

  if (!quotation) {
    return {
      title: "Quotation - CDS Space",
      alternates: { canonical: url },
      robots: { index: false, follow: false },
    };
  }

  const title = `Quotation ${quotation.quotation_number} - ${quotation.project_name}`;
  const description = `Rough project estimate for ${quotation.client_name} | Status: ${quotation.status.toUpperCase()} | Issued ${quotation.issue_date}${quotation.valid_until ? ` | Valid until ${quotation.valid_until}` : ""}.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: false, follow: false },
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

export default async function PublicQuotationPage({ params }: { params: Params }) {
  const { token } = await params;
  return <PublicQuotationClient token={token} />;
}
