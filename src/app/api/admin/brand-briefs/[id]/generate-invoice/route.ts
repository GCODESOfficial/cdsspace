import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateInvoiceNumber, randomToken } from "@/lib/finance/types";
import {
    isMissingInvoiceExtensionColumn,
    stripInvoiceExtensionFields,
} from "@/lib/finance/invoice-schema-fallback";
import { resolveClientBillingCurrency } from "@/lib/client-billing-server";

/**
 * Create a draft invoice from a brand brief.
 *
 * Client details come from the brief: the brand itself is the billing party,
 * and the submitter's name + phone are folded into `client_address` so every
 * piece of contact info carries over without a schema change. Line items are
 * populated from `assets_needed` at qty 1 / price 0 for the admin to cost.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requireFinanceAdminAsync(req, "brand_briefs");
    if (denied) return denied;

    const { id } = await params;
    const sb = getSupabaseAdmin() as any;

    const { data: brief, error: fetchErr } = await sb
        .from("brand_briefs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const clientName = brief.brand_name?.trim() || brief.contact_name?.trim() || "Client";
    const clientEmail = brief.contact_email?.trim() || null;
    const clientAddressParts = [
        brief.contact_name?.trim() ? `Attn: ${brief.contact_name.trim()}` : null,
        brief.contact_phone?.trim() ? `Phone: ${brief.contact_phone.trim()}` : null,
    ].filter(Boolean);
    const clientAddress = clientAddressParts.length ? clientAddressParts.join(" · ") : null;
    const currency = await resolveClientBillingCurrency(sb, clientEmail, "NGN");

    const invoicePayload = {
        invoice_number: generateInvoiceNumber(),
        project_id: null,
        milestone_id: null,
        client_name: clientName,
        client_email: clientEmail,
        client_address: clientAddress,
        currency,
        subtotal: 0,
        tax_rate: 0,
        tax_amount: 0,
        discount: 0,
        total: 0,
        status: "draft",
        scope: "custom",
        period_month: null,
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: null,
        notes: `Generated from brand brief: ${brief.brand_name || brief.invite_label || brief.id}`,
        public_token: randomToken(28),
        delivery_speed: "standard",
        delivery_period: brief.timeline || null,
    };

    let { data: invoice, error: insertErr } = await sb
        .from("finance_invoices")
        .insert(invoicePayload)
        .select()
        .single();
    if (insertErr && isMissingInvoiceExtensionColumn(insertErr)) {
        ({ data: invoice, error: insertErr } = await sb
            .from("finance_invoices")
            .insert(stripInvoiceExtensionFields(invoicePayload))
            .select()
            .single());
    }
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    const assets: string[] = Array.isArray(brief.assets_needed) ? brief.assets_needed : [];
    const rows = (assets.length ? assets : ["Brand brief - scope TBD"]).map((name, idx) => ({
        invoice_id: invoice.id,
        name,
        description: null,
        quantity: 1,
        unit_price: 0,
        total: 0,
        position: idx,
    }));
    await sb.from("finance_invoice_items").insert(rows);

    return NextResponse.json({ invoice });
}
