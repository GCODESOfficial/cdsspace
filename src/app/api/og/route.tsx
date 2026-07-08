import { ImageResponse } from "next/og";
import { OG_SIZE, renderBrandCard } from "@/lib/og/brand-card";
import { renderInvoiceCard } from "@/lib/og/invoice-card";
import { renderQuotationCard } from "@/lib/og/quotation-card";
import { renderPricingCard } from "@/lib/og/pricing-card";
import { getPricingListBySlug } from "@/lib/pricing/server";
import { normalizeCurrency, orderedCurrencies } from "@/lib/pricing/types";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const contentType = "image/png";

/**
 * Generic OG image endpoint.
 *
 *   /api/og?title=Hello&subtitle=World&pill=Sent          → brand card
 *   /api/og?variant=invoice&invoice=INV-...&client=...    → invoice card
 *   /api/og?variant=quotation&project=...&client=...     → quotation card
 *
 * Query params (brand card):
 *   title     - required; big bold text
 *   subtitle  - optional second line
 *   pill      - optional tag/status shown top-right (e.g. "Sent", "Live")
 *   eyebrow   - alias for `pill` (backwards-compat)
 *
 * Query params (invoice card, variant=invoice):
 *   invoice    - invoice number shown as the hero
 *   client     - client name shown as the subtitle
 *   status     - draft | sent | paid | overdue | cancelled (default "sent")
 *
 * Query params (quotation card, variant=quotation):
 *   quotation  - quotation number shown as the hero
 *   project    - project/company name
 *   client     - client name shown as the subtitle
 *   status     - draft | sent | accepted | converted | cancelled (default "sent")
 *
 * Every page can simply set:
 *   openGraph.images = [{ url: "https://cdsspace.pro/api/og?title=...&pill=..." }]
 * and get a consistent brand card without defining its own opengraph-image.tsx.
 */
export async function GET(req: Request) {
    const url = new URL(req.url);
    const fonts = getOgFonts();
    const variant = (url.searchParams.get("variant") || "brand").toLowerCase();

    if (variant === "invoice") {
        const invoice = url.searchParams.get("invoice") || "INVOICE";
        const client = url.searchParams.get("client") || "Client";
        const status =
            (url.searchParams.get("status") as
                | "draft"
                | "sent"
                | "paid"
                | "overdue"
                | "cancelled"
                | null) || "sent";

        return new ImageResponse(
            await renderInvoiceCard({
                invoiceNumber: invoice,
                clientName: client,
                status,
                issueDate: new Date().toISOString().slice(0, 10),
                dueDate: null,
                total: 0,
                currency: "NGN",
            }),
            { ...OG_SIZE, fonts },
        );
    }

    if (variant === "quotation") {
        const quotation = url.searchParams.get("quotation") || "QUOTATION";
        const project = url.searchParams.get("project") || "Project Estimate";
        const client = url.searchParams.get("client") || "Client";
        const status =
            (url.searchParams.get("status") as
                | "draft"
                | "sent"
                | "accepted"
                | "converted"
                | "cancelled"
                | null) || "sent";

        return new ImageResponse(
            await renderQuotationCard({
                quotationNumber: quotation,
                projectName: project,
                clientName: client,
                status,
            }),
            { ...OG_SIZE, fonts },
        );
    }

    if (variant === "pricing") {
        const slug = url.searchParams.get("slug") || "brand-identity";
        const list = await getPricingListBySlug(slug);
        if (list) {
            const present = orderedCurrencies(list);
            const wanted = normalizeCurrency(url.searchParams.get("c"));
            const currency = present.includes(wanted) ? wanted : present[0] ?? "ngn";
            return new ImageResponse(renderPricingCard(list, currency), { ...OG_SIZE, fonts });
        }
        // Fall through to the generic brand card if the slug is unknown.
    }

    const title = url.searchParams.get("title") || "CDS Space";
    const subtitle =
        url.searchParams.get("subtitle") || url.searchParams.get("description") || undefined;
    const pill =
        url.searchParams.get("pill") || url.searchParams.get("eyebrow") || undefined;

    return new ImageResponse(
        await renderBrandCard({
            title,
            description: subtitle,
            eyebrow: pill,
        }),
        { ...OG_SIZE, fonts },
    );
}
