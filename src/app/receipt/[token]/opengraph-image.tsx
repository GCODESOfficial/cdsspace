import { ImageResponse } from "next/og";
import { OG_SIZE, OG_CONTENT_TYPE, renderBrandCard } from "@/lib/og/brand-card";
import { financeDb } from "@/lib/finance/api-auth";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "CDS Space payment receipt";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = Promise<{ token: string }>;

/**
 * The card a shared receipt link shows. It names the receipt and the client,
 * rather than falling back to the site-wide "Home of Best Brands" artwork.
 */
export default async function Image({ params }: { params: Params }) {
  const { token } = await params;
  const fonts = getOgFonts();
  try {
    const sb = financeDb();
    const columns = "receipt_number, client_name, amount, currency, paid_at";

    // Share token first, then the receipt number, so a pasted
    // /receipt/RCT-202609-7361DD70 link renders the same card.
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

    const receipt = data as { receipt_number: string; client_name: string; amount: number; currency: string; paid_at: string } | null;

    if (!receipt) {
      return new ImageResponse(
        await renderBrandCard({
          eyebrow: "Payment receipt",
          title: "Receipt not found",
          description: "This receipt link is invalid or has been removed.",
          domainPath: "/receipt",
        }),
        { ...size, fonts },
      );
    }

    const paid = receipt.paid_at
      ? new Date(receipt.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "";
    const amount = `${receipt.currency} ${Number(receipt.amount || 0).toLocaleString()}`;

    return new ImageResponse(
      await renderBrandCard({
        eyebrow: "Paid",
        title: receipt.receipt_number,
        description: `${receipt.client_name} · ${amount}${paid ? ` · Paid ${paid}` : ""}`,
        domainPath: "/receipt",
      }),
      { ...size, fonts },
    );
  } catch {
    return new ImageResponse(
      await renderBrandCard({
        eyebrow: "Payment receipt",
        title: "CDS Space",
        description: "View your payment receipt from CDS Space.",
        domainPath: "/receipt",
      }),
      { ...size, fonts },
    );
  }
}
