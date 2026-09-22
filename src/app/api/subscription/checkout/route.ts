import { NextRequest, NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { clientCurrencyOrDefault } from "@/lib/client-billing-server";
import { financeDb } from "@/lib/finance/api-auth";
import { formatMoney, generateInvoiceNumber, randomToken } from "@/lib/finance/types";
import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { getPaystackStatus } from "@/lib/paystack";
import {
  calculateSubscriptionAmount,
  isSubscriptionPlanId,
  normalizedDesignQuantity,
  PAYSTACK_SUBSCRIPTION_CURRENCIES,
  SUBSCRIPTION_PRICE_COLUMNS,
  SUPREME_MAX_DESIGNS,
  subscriptionPlan,
} from "@/lib/subscription-plans";
import { applicationOrigin } from "@/lib/public-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentMethod = "invoice" | "paystack";

function siteOrigin(request: NextRequest) {
  return applicationOrigin(request);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function priceFromRow(row: Record<string, unknown>, column: string) {
  const value = Number(row[column] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function sendGeneratedInvoiceEmail(input: {
  to: string;
  name: string;
  invoiceNumber: string;
  planName: string;
  total: number;
  currency: Parameters<typeof formatMoney>[1];
  invoiceUrl: string;
}) {
  const safeName = escapeHtml(input.name || "there");
  const safeNumber = escapeHtml(input.invoiceNumber);
  const safePlan = escapeHtml(input.planName);
  const safeAmount = escapeHtml(formatMoney(input.total, input.currency));
  const safeUrl = escapeHtml(input.invoiceUrl);
  await sendEmail({
    to: input.to,
    fromName: "CDS Space Accounts",
    subject: `Subscription invoice ${input.invoiceNumber}`,
    text: `Your ${input.planName} subscription invoice ${input.invoiceNumber} for ${formatMoney(input.total, input.currency)} is ready: ${input.invoiceUrl}`,
    html: brandedEmailHtml(`
      <p>Hello ${safeName},</p>
      <p>Your <strong>${safePlan}</strong> subscription invoice <strong>${safeNumber}</strong> for <strong>${safeAmount}</strong> is ready.</p>
      <p>You can review the itemised invoice and choose Paystack or bank transfer from the secure invoice page.</p>
      <p style="margin:24px 0;"><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#0A4FE8;color:#ffffff;text-decoration:none;font-weight:700;">Review invoice and pay</a></p>
      <p>Your subscription becomes active automatically as soon as payment is verified.</p>
    `, { eyebrow: "Subscription invoice", preheader: `${input.invoiceNumber} is ready for payment.` }),
  });
}

async function clientAccountOrResponse() {
  const account = await getClientAccountState();
  if (!account?.agreement) {
    return { account: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const email = String(account.user.email || account.profile.email || "").trim().toLowerCase();
  if (!email || !account.profile.email_verified_at) {
    return {
      account: null,
      response: NextResponse.json({ error: "A verified account email is required." }, { status: 400 }),
    };
  }
  return { account: { ...account, email }, response: null };
}

export async function GET() {
  try {
    const auth = await clientAccountOrResponse();
    if (!auth.account) return auth.response!;

    const currency = clientCurrencyOrDefault(auth.account.profile.billing_currency);
    const column = SUBSCRIPTION_PRICE_COLUMNS[currency];
    const db = financeDb();
    const { data, error } = await db
      .from("plan_pricing")
      .select(`plan, industry, ${column}`)
      .order("industry")
      .order("plan");
    if (error) return NextResponse.json({ error: "Could not load subscription pricing." }, { status: 500 });

    const prices = (data || []).map((row: Record<string, unknown>) => ({
      plan: row.plan,
      industry: row.industry,
      unit_price: priceFromRow(row, column),
    }));
    const paystackStatus = getPaystackStatus();

    return NextResponse.json({
      currency,
      prices,
      industries: [...new Set(prices.map((row: { industry: string }) => row.industry))],
      paystack: {
        available: paystackStatus.configured && PAYSTACK_SUBSCRIPTION_CURRENCIES.has(currency),
        configured: paystackStatus.configured,
        mode: paystackStatus.mode,
      },
    });
  } catch (error) {
    console.error("[subscription-checkout] pricing load failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not load subscription pricing." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await clientAccountOrResponse();
    if (!auth.account) return auth.response!;

    const body = await request.json().catch(() => ({}));
    const planId = body.plan;
    const industry = String(body.industry || "").trim();
    const paymentMethod: PaymentMethod = body.payment_method === "paystack" ? "paystack" : "invoice";
    if (!isSubscriptionPlanId(planId)) {
      return NextResponse.json({ error: "Choose a valid subscription plan." }, { status: 400 });
    }
    if (!industry || industry.length > 120) {
      return NextResponse.json({ error: "Choose a valid business industry." }, { status: 400 });
    }

    const quantity = normalizedDesignQuantity(planId, body.design_quantity);
    if (!quantity) {
      return NextResponse.json({ error: `Supreme design quantity must be between 1 and ${SUPREME_MAX_DESIGNS}.` }, { status: 400 });
    }

    const currency = clientCurrencyOrDefault(auth.account.profile.billing_currency);
    const paystackStatus = getPaystackStatus();
    const paystackAvailable = paystackStatus.configured && PAYSTACK_SUBSCRIPTION_CURRENCIES.has(currency);
    if (paymentMethod === "paystack" && !paystackAvailable) {
      return NextResponse.json({
        error: paystackStatus.configured
          ? `Paystack checkout is not available for ${currency}. Generate an invoice instead.`
          : "Paystack checkout is not configured yet. Generate an invoice instead.",
      }, { status: 409 });
    }

    const db = financeDb();
    const column = SUBSCRIPTION_PRICE_COLUMNS[currency];
    const { data: pricing, error: pricingError } = await db
      .from("plan_pricing")
      .select(`plan, industry, ${column}`)
      .eq("plan", planId)
      .eq("industry", industry)
      .maybeSingle();
    if (pricingError || !pricing) {
      return NextResponse.json({ error: "This plan is not priced for the selected industry yet." }, { status: 409 });
    }

    const unitPrice = priceFromRow(pricing, column);
    if (!unitPrice) {
      return NextResponse.json({ error: "The admin has not set this plan price yet." }, { status: 409 });
    }
    const total = calculateSubscriptionAmount(planId, unitPrice, quantity);
    const plan = subscriptionPlan(planId);

    const { data: existingPending } = await db
      .from("subscriptions")
      .select("id, plan, industry, design_quantity, invoice_id")
      .eq("user_id", auth.account.user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      existingPending?.invoice_id
      && existingPending.plan === planId
      && existingPending.industry === industry
      && Number(existingPending.design_quantity || 1) === quantity
    ) {
      const { data: existingInvoice } = await db
        .from("finance_invoices")
        .select("id, invoice_number, public_token, status")
        .eq("id", existingPending.invoice_id)
        .maybeSingle();
      if (existingInvoice && ["sent", "overdue"].includes(existingInvoice.status)) {
        const invoiceUrl = `${siteOrigin(request)}/invoice/${existingInvoice.public_token}`;
        return NextResponse.json({
          ok: true,
          reused: true,
          invoice_url: invoiceUrl,
          paystack_endpoint: `/api/finance/invoice/${existingInvoice.public_token}/paystack`,
          invoice_number: existingInvoice.invoice_number,
          payment_method: paymentMethod,
        });
      }
    }

    if (existingPending) {
      await db.from("subscriptions").update({
        status: "cancelled",
        payment_status: "cancelled",
        updated_at: new Date().toISOString(),
      }).eq("id", existingPending.id);
      if (existingPending.invoice_id) {
        await db.from("finance_invoices")
          .update({ status: "cancelled" })
          .eq("id", existingPending.invoice_id)
          .in("status", ["draft", "sent", "overdue"]);
      }
    }

    const now = new Date();
    const due = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const invoicePayload = {
      invoice_number: generateInvoiceNumber(),
      user_id: auth.account.user.id,
      client_name: auth.account.profile.full_name || auth.account.profile.company_name || auth.account.email,
      client_email: auth.account.email,
      client_address: null,
      currency,
      subtotal: total,
      tax_rate: 0,
      tax_amount: 0,
      discount: 0,
      total,
      status: "sent",
      scope: "monthly",
      period_month: now.toISOString().slice(0, 7),
      issue_date: now.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
      notes: `${plan.name} subscription for ${industry}. The subscription activates automatically after payment is verified.`,
      payment_terms: "Payment is required before subscription activation.",
      revisions_note: "Revisions are included according to the selected subscription plan.",
      working_hours: "9am-5:30pm Monday-Friday UTC+1",
      delivery_speed: "standard",
      delivery_period: planId === "supreme" ? "Priority turnaround" : "Monthly subscription",
      public_token: randomToken(28),
    };

    const { data: invoice, error: invoiceError } = await db
      .from("finance_invoices")
      .insert(invoicePayload)
      .select("id, invoice_number, public_token")
      .single();
    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Could not generate the subscription invoice." }, { status: 500 });
    }

    const itemQuantity = planId === "supreme" ? quantity : 1;
    const itemDescription = planId === "supreme"
      ? `${quantity} design unit${quantity === 1 ? "" : "s"} for ${industry}`
      : `${plan.name} monthly subscription for ${industry}`;
    const { error: itemError } = await db.from("finance_invoice_items").insert({
      invoice_id: invoice.id,
      name: `${plan.name} subscription`,
      description: itemDescription,
      quantity: itemQuantity,
      unit_price: unitPrice,
      total,
      position: 0,
    });
    if (itemError) {
      await db.from("finance_invoices").delete().eq("id", invoice.id);
      return NextResponse.json({ error: "Could not itemise the subscription invoice." }, { status: 500 });
    }

    const companyName = auth.account.profile.company_name || auth.account.profile.full_name || "Client business";
    const { error: subscriptionError } = await db.from("subscriptions").insert({
      user_id: auth.account.user.id,
      plan: planId,
      industry,
      company_name: companyName,
      design_count: 0,
      design_quantity: planId === "supreme" ? quantity : plan.includedDesigns,
      unit_price: unitPrice,
      amount: total,
      currency,
      status: "pending",
      payment_status: "pending",
      invoice_id: invoice.id,
    });
    if (subscriptionError) {
      await db.from("finance_invoices").delete().eq("id", invoice.id);
      return NextResponse.json({ error: "Could not prepare the subscription." }, { status: 500 });
    }

    const invoiceUrl = `${siteOrigin(request)}/invoice/${invoice.public_token}`;
    const emailResult = await sendGeneratedInvoiceEmail({
      to: auth.account.email,
      name: auth.account.profile.full_name || auth.account.profile.company_name || "there",
      invoiceNumber: invoice.invoice_number,
      planName: plan.name,
      total,
      currency,
      invoiceUrl,
    }).then(() => true).catch((emailError) => {
      console.error("[subscription-checkout] invoice email failed", emailError instanceof Error ? emailError.message : emailError);
      return false;
    });

    try {
      await db.from("notifications").insert({
        user_id: auth.account.user.id,
        type: "status_change",
        title: "Subscription invoice ready",
        message: `${invoice.invoice_number} is ready for payment.`,
        link: `/invoice/${invoice.public_token}`,
        is_read: false,
      });
    } catch {
      // Non-fatal: the generated invoice remains available in the client account.
    }

    return NextResponse.json({
      ok: true,
      reused: false,
      invoice_url: invoiceUrl,
      paystack_endpoint: `/api/finance/invoice/${invoice.public_token}/paystack`,
      invoice_number: invoice.invoice_number,
      payment_method: paymentMethod,
      email_sent: emailResult,
    });
  } catch (error) {
    console.error("[subscription-checkout] checkout failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not start subscription checkout." }, { status: 500 });
  }
}
