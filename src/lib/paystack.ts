import "server-only";

import crypto from "node:crypto";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getSupabaseAdmin } from "@/lib/supabase";
import { emailInvoiceReceipt } from "@/lib/finance/receipt-server";
import { deliverInvoicePaymentConfirmation } from "@/lib/finance/payment-confirmation";

const PAYSTACK_API = "https://api.paystack.co";
const SUPPORTED_SETUP_CURRENCIES = new Set(["NGN", "GHS", "ZAR", "KES", "USD"]);
const DEFAULT_SETUP_AMOUNTS: Record<string, number> = {
  NGN: 5000,
  GHS: 10,
  ZAR: 100,
  KES: 300,
  USD: 200,
};

export interface ClientPaymentMethod {
  id: string;
  provider: "paystack";
  payment_email: string;
  channel: string;
  card_type: string | null;
  card_brand: string | null;
  last4: string | null;
  exp_month: string | null;
  exp_year: string | null;
  bank: string | null;
  country_code: string | null;
  reusable: boolean;
  is_default: boolean;
  is_active: boolean;
  updated_at: string;
}

interface SetupSession {
  id: string;
  user_id: string;
  reference: string;
  payment_email: string;
  amount: number;
  currency: string;
  status: string;
}

interface PaystackAuthorization {
  authorization_code?: string;
  signature?: string;
  channel?: string;
  card_type?: string;
  brand?: string;
  last4?: string;
  exp_month?: string;
  exp_year?: string;
  bank?: string;
  country_code?: string;
  reusable?: boolean;
  [key: string]: unknown;
}

interface PaystackTransaction {
  reference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  authorization?: PaystackAuthorization;
  customer?: { customer_code?: string; email?: string };
  [key: string]: unknown;
}

function paystackSecret() {
  return process.env.PAYSTACK_SECRET_KEY?.trim() || "";
}

export function getPaystackStatus() {
  const secret = paystackSecret();
  return {
    configured: Boolean(secret),
    mode: secret.startsWith("sk_live_") ? "live" as const : secret ? "test" as const : "unconfigured" as const,
  };
}

export function getPaystackCardSetupConfig() {
  const requestedCurrency = (process.env.PAYSTACK_CARD_SETUP_CURRENCY || "NGN").trim().toUpperCase();
  const currency = SUPPORTED_SETUP_CURRENCIES.has(requestedCurrency) ? requestedCurrency : "NGN";
  const requestedAmount = Number(process.env.PAYSTACK_CARD_SETUP_AMOUNT || "");
  const amount = Number.isInteger(requestedAmount) && requestedAmount > 0
    ? requestedAmount
    : DEFAULT_SETUP_AMOUNTS[currency];
  return { currency, amount };
}

export function newPaystackReference() {
  return `CDSCARD-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

export function newPaystackInvoiceReference() {
  return `CDSINV-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

export async function paystackRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = paystackSecret();
  if (!secret) throw new Error("Paystack is not configured yet.");

  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.status === false) {
    throw new Error(typeof payload?.message === "string" ? payload.message : "Paystack could not process this request.");
  }
  return payload as T;
}

export function verifyPaystackWebhook(rawBody: string, signature: string | null) {
  const secret = paystackSecret();
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function loadClientPaymentMethod(userId: string): Promise<ClientPaymentMethod | null> {
  return glashMaybeOne<ClientPaymentMethod>(
    `select id, provider, payment_email, channel, card_type, card_brand, last4,
            exp_month, exp_year, bank, country_code, reusable, is_default,
            is_active, updated_at
       from public.client_payment_methods
      where user_id = $1 and provider = 'paystack' and is_active is true
      limit 1`,
    [userId],
  );
}

export async function createPaymentSetupSession(input: {
  userId: string;
  reference: string;
  email: string;
  amount: number;
  currency: string;
}) {
  await glashQuery(
    `insert into public.client_payment_setup_sessions
       (user_id, reference, payment_email, amount, currency)
     values ($1, $2, $3, $4, $5)`,
    [input.userId, input.reference, input.email.toLowerCase(), input.amount, input.currency],
  );
}

export async function failPaymentSetupSession(reference: string, message: string) {
  await glashQuery(
    `update public.client_payment_setup_sessions
        set status = 'failed', provider_response = $2::jsonb, updated_at = now()
      where reference = $1 and status = 'pending'`,
    [reference, JSON.stringify({ message: message.slice(0, 500) })],
  );
}

async function verifiedTransaction(reference: string) {
  const payload = await paystackRequest<{ data?: PaystackTransaction }>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  return payload.data || null;
}

/**
 * Verify and save a reusable Paystack authorization. This function is
 * idempotent so both callbacks and signed webhooks can safely call it.
 */
export async function finalizePaystackCardSetup(
  reference: string,
  suppliedTransaction?: PaystackTransaction,
): Promise<ClientPaymentMethod | null> {
  const session = await glashMaybeOne<SetupSession>(
    `select id, user_id, reference, payment_email, amount, currency, status
       from public.client_payment_setup_sessions
      where reference = $1
      limit 1`,
    [reference],
  );
  if (!session) return null;
  if (session.status === "successful") return loadClientPaymentMethod(session.user_id);

  const transaction = suppliedTransaction || await verifiedTransaction(reference);
  const authorization = transaction?.authorization;
  const responseEmail = String(transaction?.customer?.email || "").trim().toLowerCase();
  const valid = Boolean(
    transaction
    && transaction.reference === session.reference
    && transaction.status === "success"
    && Number(transaction.amount) === Number(session.amount)
    && String(transaction.currency || "").toUpperCase() === session.currency.toUpperCase()
    && responseEmail === session.payment_email.toLowerCase()
    && authorization?.authorization_code
    && authorization.reusable === true
  );

  if (!transaction || !valid || !authorization?.authorization_code) {
    await failPaymentSetupSession(reference, "The verified transaction did not contain a reusable card authorization.");
    throw new Error("This payment method could not be verified for future payments.");
  }

  await glashQuery(
    `insert into public.client_payment_methods
       (user_id, provider, authorization_code, authorization_signature, customer_code,
        payment_email, channel, card_type, card_brand, last4, exp_month, exp_year,
        bank, country_code, reusable, is_default, is_active, paystack_reference,
        authorization_data, updated_at)
     values ($1, 'paystack', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             $12, $13, true, true, true, $14, $15::jsonb, now())
     on conflict (user_id, provider) do update set
       authorization_code = excluded.authorization_code,
       authorization_signature = excluded.authorization_signature,
       customer_code = excluded.customer_code,
       payment_email = excluded.payment_email,
       channel = excluded.channel,
       card_type = excluded.card_type,
       card_brand = excluded.card_brand,
       last4 = excluded.last4,
       exp_month = excluded.exp_month,
       exp_year = excluded.exp_year,
       bank = excluded.bank,
       country_code = excluded.country_code,
       reusable = excluded.reusable,
       is_default = true,
       is_active = true,
       paystack_reference = excluded.paystack_reference,
       authorization_data = excluded.authorization_data,
       updated_at = now()`,
    [
      session.user_id,
      authorization.authorization_code,
      authorization.signature || null,
      transaction.customer?.customer_code || null,
      session.payment_email,
      authorization.channel || "card",
      authorization.card_type || null,
      authorization.brand || null,
      authorization.last4 || null,
      authorization.exp_month || null,
      authorization.exp_year || null,
      authorization.bank || null,
      authorization.country_code || null,
      session.reference,
      JSON.stringify(authorization),
    ],
  );

  await glashQuery(
    `update public.client_payment_setup_sessions
        set status = 'successful', provider_response = $2::jsonb,
            completed_at = now(), updated_at = now()
      where id = $1`,
    [session.id, JSON.stringify({ status: transaction.status, reference: transaction.reference })],
  );

  return loadClientPaymentMethod(session.user_id);
}

export async function removeClientPaymentMethod(userId: string) {
  await glashQuery(
    `delete from public.client_payment_methods
      where user_id = $1 and provider = 'paystack'`,
    [userId],
  );
}

interface PaystackInvoiceRow {
  submission_id: string;
  submission_status: string;
  invoice_id: string;
  invoice_number: string;
  public_token: string;
  client_email: string | null;
  total: number;
  currency: string;
}

async function deliverPaystackInvoiceConfirmation(invoiceId: string) {
  const db = getSupabaseAdmin();
  await Promise.allSettled([
    emailInvoiceReceipt(db, invoiceId),
    deliverInvoicePaymentConfirmation(db, invoiceId),
  ]);
}

/** Verify a hosted Paystack invoice payment before changing finance state. */
export async function finalizePaystackInvoicePayment(reference: string, suppliedTransaction?: PaystackTransaction) {
  const record = await glashMaybeOne<PaystackInvoiceRow>(
    `select submission.id as submission_id,
            submission.status as submission_status,
            invoice.id as invoice_id,
            invoice.invoice_number,
            invoice.public_token,
            invoice.client_email,
            invoice.total,
            invoice.currency
       from public.invoice_payment_submissions submission
       join public.finance_invoices invoice on invoice.id = submission.invoice_id
      where submission.method = 'paystack'
        and submission.transfer_reference = $1
      limit 1`,
    [reference],
  );
  if (!record) return null;
  if (record.submission_status === "confirmed") {
    await deliverPaystackInvoiceConfirmation(record.invoice_id);
    return record;
  }

  const transaction = suppliedTransaction || await verifiedTransaction(reference);
  const expectedMinorAmount = Math.round(Number(record.total) * 100);
  const responseEmail = String(transaction?.customer?.email || "").trim().toLowerCase();
  const expectedEmail = String(record.client_email || "").trim().toLowerCase();
  const valid = Boolean(
    transaction
    && transaction.reference === reference
    && transaction.status === "success"
    && Number(transaction.amount) === expectedMinorAmount
    && String(transaction.currency || "").toUpperCase() === record.currency.toUpperCase()
    && (!expectedEmail || responseEmail === expectedEmail)
  );
  if (!valid) throw new Error("The Paystack transaction did not match this invoice.");

  await glashQuery(
    `update public.finance_invoices
        set status = 'paid'
      where id = $1 and status not in ('paid', 'cancelled')`,
    [record.invoice_id],
  );
  await glashQuery(
    `update public.invoice_payment_submissions
        set status = 'confirmed', reviewed_at = coalesce(reviewed_at, now()),
            reviewed_by = 'Paystack verification', updated_at = now()
      where id = $1 and status = 'pending'`,
    [record.submission_id],
  );
  await deliverPaystackInvoiceConfirmation(record.invoice_id);
  return record;
}
