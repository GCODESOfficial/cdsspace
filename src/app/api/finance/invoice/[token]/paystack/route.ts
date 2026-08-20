import { NextRequest, NextResponse } from "next/server";
import { financeDb } from "@/lib/finance/api-auth";
import { getPaystackStatus, newPaystackInvoiceReference, paystackRequest } from "@/lib/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteOrigin(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try { return new URL(configured).origin; } catch { /* use request origin */ }
  }
  return request.nextUrl.origin;
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
  const email = String(invoice.client_email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "A client email is required for Paystack checkout." }, { status: 400 });

  const reference = newPaystackInvoiceReference();
  const { data: existingSubmission } = await db.from("invoice_payment_submissions").select("id").eq("invoice_id", invoice.id).eq("status", "pending").maybeSingle();
  const submissionPayload = {
    invoice_id: invoice.id,
    user_id: invoice.user_id || null,
    method: "paystack",
    status: "pending",
    amount: Number(invoice.total),
    currency: invoice.currency,
    payer_name: invoice.client_name || null,
    payer_email: email,
    transfer_reference: reference,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const submissionWrite = existingSubmission
    ? await db.from("invoice_payment_submissions").update(submissionPayload).eq("id", existingSubmission.id)
    : await db.from("invoice_payment_submissions").insert(submissionPayload);
  const submissionError = submissionWrite.error;
  if (submissionError) return NextResponse.json({ error: "Could not prepare this payment." }, { status: 500 });

  try {
    const origin = siteOrigin(request);
    const callback = new URL("/api/finance/paystack/callback", origin);
    callback.searchParams.set("invoice", invoice.public_token);
    const payload = await paystackRequest<{ data?: { authorization_url?: string } }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email,
        amount: String(Math.round(Number(invoice.total) * 100)),
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
