import { ImageResponse } from "next/og";
import { OG_SIZE, OG_CONTENT_TYPE, renderBrandCard } from "@/lib/og/brand-card";
import { renderQuotationCard } from "@/lib/og/quotation-card";
import { financeDb } from "@/lib/finance/api-auth";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "CDS Space Quotation";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = Promise<{ token: string }>;

export default async function Image({ params }: { params: Params }) {
    const { token } = await params;
    const fonts = getOgFonts();
    try {
        const sb = financeDb();
        const cols = "quotation_number, project_name, client_name, status";

        let { data } = await sb
            .from("finance_quotations")
            .select(cols)
            .eq("public_token", token)
            .maybeSingle();
        if (!data) {
            const { data: byNumber } = await sb
                .from("finance_quotations")
                .select(cols)
                .ilike("quotation_number", token)
                .maybeSingle();
            data = byNumber;
        }

        const quotation = data as
            | {
                  quotation_number: string;
                  project_name: string;
                  client_name: string;
                  status: "draft" | "sent" | "accepted" | "converted" | "cancelled";
              }
            | null;

        if (!quotation) {
            return new ImageResponse(
                await renderBrandCard({
                    eyebrow: "Quotation",
                    title: "Quotation not found",
                    description: "This quotation link is invalid or has been removed.",
                    domainPath: "/quotation",
                }),
                { ...size, fonts },
            );
        }

        return new ImageResponse(
            await renderQuotationCard({
                quotationNumber: quotation.quotation_number,
                projectName: quotation.project_name,
                clientName: quotation.client_name,
                status: quotation.status,
            }),
            { ...size, fonts },
        );
    } catch {
        return new ImageResponse(
            await renderBrandCard({
                eyebrow: "Quotation",
                title: "CDS Space",
                description: "View your quotation from CDS Space.",
                domainPath: "/quotation",
            }),
            { ...size, fonts },
        );
    }
}
