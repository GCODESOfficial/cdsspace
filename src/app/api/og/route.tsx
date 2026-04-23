import { ImageResponse } from "next/og";
import { OG_SIZE, renderBrandCard } from "@/lib/og/brand-card";
import { renderInvoiceCard } from "@/lib/og/invoice-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const contentType = "image/png";

/**
 * Generic OG image endpoint.
 *
 *   /api/og?title=Hello&subtitle=World&pill=Sent          → brand card
 *   /api/og?variant=invoice&invoice=INV-...&client=...    → invoice card
 *
 * Query params (brand card):
 *   title     — required; big bold text
 *   subtitle  — optional second line
 *   pill      — optional tag/status shown top-right (e.g. "Sent", "Live")
 *   eyebrow   — alias for `pill` (backwards-compat)
 *
 * Query params (invoice card, variant=invoice):
 *   invoice    — invoice number shown as the hero
 *   client     — client name shown as the subtitle
 *   status     — draft | sent | paid | overdue | cancelled (default "sent")
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
