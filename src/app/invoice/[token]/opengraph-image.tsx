import { ImageResponse } from "next/og";
import { OG_SIZE, OG_CONTENT_TYPE, renderBrandCard } from "@/lib/og/brand-card";
import { renderInvoiceCard } from "@/lib/og/invoice-card";
import { financeDb } from "@/lib/finance/api-auth";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const alt = "CDS Space Invoice";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = Promise<{ token: string }>;

export default async function Image({ params }: { params: Params }) {
    const { token } = await params;
    const fonts = getOgFonts();
    try {
        const sb = financeDb();
        const cols = "invoice_number, client_name, status, issue_date, due_date, total, currency";

        // Try the share token first, then fall back to the invoice number so
        // pasted links like /invoice/INV-202604-7227 still render correctly.
        let { data } = await sb
            .from("finance_invoices")
            .select(cols)
            .eq("public_token", token)
            .maybeSingle();
        if (!data) {
            const { data: byNumber } = await sb
                .from("finance_invoices")
                .select(cols)
                .ilike("invoice_number", token)
                .maybeSingle();
            data = byNumber;
        }

        const invoice = data as
            | {
                  invoice_number: string;
                  client_name: string;
                  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
                  issue_date: string;
                  due_date: string | null;
                  total: number;
                  currency: string;
              }
            | null;

        if (!invoice) {
            return new ImageResponse(
                await renderBrandCard({
                    eyebrow: "Invoice",
                    title: "Invoice not found",
                    description: "This invoice link is invalid or has been removed.",
                    domainPath: "/invoice",
                }),
                { ...size, fonts },
            );
        }

        return new ImageResponse(
            await renderInvoiceCard({
                invoiceNumber: invoice.invoice_number,
                clientName: invoice.client_name,
                status: invoice.status,
                issueDate: invoice.issue_date,
                dueDate: invoice.due_date,
                total: Number(invoice.total || 0),
                currency: invoice.currency,
            }),
            { ...size, fonts },
        );
    } catch {
        return new ImageResponse(
            await renderBrandCard({
                eyebrow: "Invoice",
                title: "CDS Space",
                description: "View your invoice from CDS Space.",
                domainPath: "/invoice",
            }),
            { ...size, fonts },
        );
    }
}
