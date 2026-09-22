import { NextRequest, NextResponse } from "next/server";
import { financeDb } from "@/lib/finance/api-auth";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import { ADMIN_FEATURE_PERMISSION_KEYS, notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROOF_BYTES = 10 * 1024 * 1024;

async function findInvoice(db: any, token: string) {
  let { data } = await db.from("finance_invoices").select("*").eq("public_token", token).maybeSingle();
  if (!data) {
    const result = await db.from("finance_invoices").select("*").ilike("invoice_number", token).maybeSingle();
    data = result.data;
  }
  return data;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = financeDb();

  try {
    const invoice = await findInvoice(db, token);
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    if (invoice.status === "paid") return NextResponse.json({ error: "This invoice is already paid." }, { status: 409 });
    if (invoice.status === "cancelled" || invoice.status === "draft") {
      return NextResponse.json({ error: "This invoice is not open for payment." }, { status: 409 });
    }

    const form = await request.formData();
    const proof = form.get("proof") instanceof File ? form.get("proof") as File : null;
    const transferReference = String(form.get("reference") || "").trim().slice(0, 120) || null;
    const payerName = String(form.get("payerName") || invoice.client_name || "").trim().slice(0, 160) || null;
    const payerEmail = String(invoice.client_email || form.get("payerEmail") || "").trim().toLowerCase().slice(0, 254) || null;
    const outstanding = Math.max(Number(invoice.total || 0) - Number(invoice.amount_paid || 0), 0);
    const amount = Number(form.get("amount") || outstanding);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter the amount transferred." }, { status: 400 });
    if (amount > outstanding + 0.01) return NextResponse.json({ error: "The transfer amount cannot exceed the outstanding invoice balance." }, { status: 400 });
    if (payerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
      return NextResponse.json({ error: "Enter a valid payer email address." }, { status: 400 });
    }

    const { data: existing } = await db
      .from("invoice_payment_submissions")
      .select("*")
      .eq("invoice_id", invoice.id)
      .eq("status", "pending")
      .maybeSingle();

    let proofData: Record<string, unknown> = {};
    if (proof && proof.size > 0) {
      const safe = await assertSafeUpload(proof, {
        allow: ["image", "pdf"],
        maxBytes: MAX_PROOF_BYTES,
        imageMaxDimension: 9000,
      });
      const storagePath = `${invoice.id}/${crypto.randomUUID()}.${safe.ext}`;
      const storage = (db as any).storage.from("payment-proofs");
      const { error: uploadError } = await storage.upload(storagePath, safe.buffer, {
        contentType: safe.contentType,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      if (existing?.proof_storage_path) await storage.remove([existing.proof_storage_path]).catch(() => null);
      proofData = {
        proof_storage_path: storagePath,
        proof_file_name: proof.name.slice(0, 255),
        proof_mime_type: safe.contentType,
        proof_size_bytes: safe.buffer.length,
      };
    }

    const payload = {
      invoice_id: invoice.id,
      user_id: invoice.user_id || null,
      method: "bank_transfer",
      status: "pending",
      amount,
      currency: invoice.currency,
      payer_name: payerName,
      payer_email: payerEmail,
      transfer_reference: transferReference,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...proofData,
    };

    const result = existing
      ? await db.from("invoice_payment_submissions").update(payload).eq("id", existing.id).select("*").single()
      : await db.from("invoice_payment_submissions").insert(payload).select("*").single();
    if (result.error) throw result.error;

    const submission = { ...result.data };
    delete submission.proof_storage_path;
    if (!existing) await notifyAdminFeatureEvent({
      permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.invoices,
      departmentNames: ["Finance"],
      title: `Payment submitted · ${invoice.invoice_number}`,
      body: `${invoice.client_name || "A client"} submitted a ${invoice.currency} ${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bank-transfer confirmation for ${invoice.invoice_number}${proof ? " with proof attached" : ""}. Verify the transfer before updating the invoice balance.`,
      link: `/admin/finance/invoices/${invoice.id}`,
      teamLink: "/team",
      eyebrow: "Finance · Payment review",
      details: {
        Invoice: invoice.invoice_number,
        Client: invoice.client_name || "Client",
        Amount: `${invoice.currency} ${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        Reference: transferReference,
      },
    });
    return NextResponse.json({ ok: true, submission });
  } catch (error) {
    if (error instanceof UploadSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[invoice-payment] submission failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment confirmation could not be submitted." }, { status: 500 });
  }
}
