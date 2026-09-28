import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { generateInvoiceNumber, randomToken } from "@/lib/finance/types";
import { letterheadDesignPriceFor } from "@/lib/letterhead-design-pricing";
import { notifySuperAdmin } from "@/lib/notify-admin";
import { queueAdminAlert } from "@/lib/admin-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Ask CDS Space to design my letterhead."
 *
 * Raises the invoice immediately, in the currency the client's account is
 * billed in, at the price held in Sales Settings. One open request at a time:
 * asking twice returns the invoice already waiting rather than billing again.
 */
export async function POST() {
  try {
    const session = await verifyUser();
    if (!session) return NextResponse.json({ error: "Sign in to request a letterhead design." }, { status: 401 });
    if (!supabaseAdmin) return NextResponse.json({ error: "Storage is not configured." }, { status: 500 });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,company_name,billing_currency")
      .eq("id", session.user.id)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: "Client profile not found." }, { status: 400 });

    const clientName = profile.company_name || profile.full_name || profile.email || "Client";
    const { currency, amount } = await letterheadDesignPriceFor(profile.billing_currency);

    // Billing twice for the same unpaid request would be a real cost to the
    // client, so an existing unpaid one is returned instead.
    const { data: existing } = await supabaseAdmin
      .from("finance_invoices")
      .select("id, invoice_number, public_token, total, currency, status")
      .eq("user_id", session.user.id)
      .eq("scope", "custom")
      .ilike("notes", "%Letterhead design%")
      .in("status", ["draft", "sent", "overdue"])
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ invoice: existing, alreadyRequested: true });
    }

    const { data: invoice, error } = await supabaseAdmin
      .from("finance_invoices")
      .insert({
        invoice_number: generateInvoiceNumber(),
        client_name: clientName,
        client_email: profile.email,
        user_id: session.user.id,
        currency,
        subtotal: amount,
        tax_rate: 0,
        tax_amount: 0,
        discount: 0,
        total: amount,
        status: "sent",
        scope: "custom",
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        notes: "Letterhead design by the CDS Space team. Your finished letterhead is delivered within 24 hours of confirmed payment, and is added to your Create letterhead tool automatically.",
        delivery_speed: "standard",
        // A letterhead is a single-page design, so it is promised within a day
        // of payment rather than the multi-day turnaround of larger work.
        delivery_period: "24 hours",
        public_token: randomToken(28),
      })
      .select()
      .single();
    if (error || !invoice) {
      return NextResponse.json({ error: error?.message || "The request could not be raised." }, { status: 500 });
    }

    const { error: itemError } = await supabaseAdmin.from("finance_invoice_items").insert([{
      invoice_id: invoice.id,
      name: "Letterhead design",
      description: "Custom first-page and continuation letterhead designed by the CDS Space team.",
      quantity: 1,
      unit_price: amount,
      total: amount,
      position: 0,
    }]);
    if (itemError) {
      await supabaseAdmin.from("finance_invoices").delete().eq("id", invoice.id);
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }

    await Promise.all([
      supabaseAdmin.from("notifications").insert({
        user_id: session.user.id,
        type: "new_order",
        title: "Letterhead design invoice ready",
        message: `Invoice ${invoice.invoice_number} is ready. Design starts once payment is confirmed.`,
        link: "/dashboard/invoices",
        is_read: false,
      }),
      notifySuperAdmin({
        type: "status_change",
        title: "Letterhead design requested",
        message: `${clientName} requested a letterhead design (${invoice.invoice_number}).`,
        link: "/admin/finance/invoices",
      }),
    ]);

    queueAdminAlert({
      kind: "order",
      subject: `${clientName}: letterhead design`,
      details: [
        ["Client", clientName],
        ["Email", profile.email],
        ["Invoice", invoice.invoice_number],
        ["Amount", `${currency} ${amount.toLocaleString()}`],
        ["Status", "Awaiting payment"],
      ],
      actionPath: "/admin/finance/invoices",
      actionLabel: "Open invoices",
      ...(profile.email ? { replyTo: profile.email } : {}),
    });

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        public_token: invoice.public_token,
        total: amount,
        currency,
      },
    });
  } catch (error) {
    console.error("[letterhead-design-request] failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be raised." }, { status: 500 });
  }
}
