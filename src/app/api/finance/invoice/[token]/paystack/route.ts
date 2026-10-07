import { NextRequest, NextResponse } from "next/server";
import { financeDb } from "@/lib/finance/api-auth";
import { getPaystackStatus, newPaystackInvoiceReference, paystackAvailableFor, paystackRequest } from "@/lib/paystack";
import { applicationOrigin } from "@/lib/public-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteOrigin(request: NextRequest) {
  return applicationOrigin(request);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!getPaystackStatus().configured) return NextResponse.json({ error: "Paystack checkout is not available yet." }, { status: 503 });
  const db = financeDb();
  let { data: invoice } = await db.from("finance_invoices").select("*").eq("public_token", token).maybeSingle();
  if (!invoice) {
    const result = await db.from("finance_invoices").select("*").ilike("invoice_number", token).maybeSingle();
    invoice = result.data;
  }
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "draft") {
    return NextResponse.json({ error: "This invoice is not open for payment." }, { status: 409 });
  }
  if (!paystackAvailableFor(invoice.currency)) {
    return NextResponse.json({ error: `Paystack checkout is not available for ${invoice.currency} invoices.` }, { status: 409 });
  }
  const email = String(invoice.client_email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "A client email is required for Paystack checkout." }, { status: 400 });
  const outstanding = Math.max(Number(invoice.total || 0) - Number(invoice.amount_paid || 0), 0);
  if (outstanding <= 0) return NextResponse.json({ error: "This invoice has no outstanding balance." }, { status: 409 });

  const { data: pendingTransfer } = await db.from("invoice_payment_submissions").select("id").eq("invoice_id", invoice.id).eq("status", "pending").maybeSingle();
  if (pendingTransfer) return NextResponse.json({ error: "A bank transfer for this invoice is already being confirmed by CDS Space Finance." }, { status: 409 });

  // Each checkout gets its own "initiated" row so a late webhook for an earlier
  // attempt still matches its reference. Initiated rows never reach Finance review.
  const reference = newPaystackInvoiceReference();
  const submissionPayload = {
    invoice_id: invoice.id,
    user_id: invoice.user_id || null,
    method: "paystack",
    status: "initiated",
    amount: outstanding,
    currency: invoice.currency,
    payer_name: invoice.client_name || null,
    payer_email: email,
    transfer_reference: reference,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error: submissionError } = await db.from("invoice_payment_submissions").insert(submissionPayload);
  if (submissionError) return NextResponse.json({ error: "Could not prepare this payment." }, { status: 500 });

  try {
    const origin = siteOrigin(request);
    const callback = new URL("/api/finance/paystack/callback", origin);
    callback.searchParams.set("invoice", invoice.public_token);
    const payload = await paystackRequest<{ data?: { authorization_url?: string } }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email,
        amount: String(Math.round(outstanding * 100)),
        currency: invoice.currency,
        reference,
        callback_url: callback.toString(),
        metadata: JSON.stringify({ purpose: "invoice_payment", invoice_id: invoice.id, invoice_number: invoice.invoice_number }),
      }),
    });
    const checkout = new URL(payload.data?.authorization_url || "");
    if (checkout.protocol !== "https:" || !(checkout.hostname === "paystack.com" || checkout.hostname.endsWith(".paystack.com"))) throw new Error("Paystack returned an invalid checkout URL.");
    return NextResponse.json({ ok: true, authorization_url: checkout.toString() });
  } catch (error) {
    await db.from("invoice_payment_submissions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("invoice_id", invoice.id).eq("transfer_reference", reference);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start Paystack checkout." }, { status: 502 });
  }
}
