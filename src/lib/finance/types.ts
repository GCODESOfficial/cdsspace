import { CLIENT_BILLING_CURRENCIES, CLIENT_BILLING_CURRENCY_OPTIONS, type ClientBillingCurrency } from "@/lib/client-billing";

export type Currency = ClientBillingCurrency;

// Finance and client onboarding intentionally share one currency source so an
// account currency can always be selected before an invoice is created.
export const CURRENCIES: Currency[] = [...CLIENT_BILLING_CURRENCIES];

export const CURRENCY_NAMES = Object.fromEntries(
  CLIENT_BILLING_CURRENCY_OPTIONS.map((currency) => [currency.code, currency.name]),
) as Record<Currency, string>;

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  NGN: "₦",
  RWF: "FRw ",
  USD: "$",
  GBP: "£",
  EUR: "€",
  CNY: "¥",
  AED: "AED ",
};

export function formatMoney(amount: number | string | null | undefined, currency: Currency = "NGN") {
  const n = Number(amount ?? 0);
  return `${CURRENCY_SYMBOLS[currency]}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatFinanceDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric" },
  locale = "en-US",
) {
  if (!value) return "-";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  try {
    const date = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(locale, options);
  } catch {
    return value;
  }
}

export interface FinanceProject {
  id: string;
  name: string;
  client: string;
  client_email?: string | null;
  user_id?: string | null;
  currency: Currency;
  duration_start: string | null;
  duration_end: string | null;
  status: "active" | "completed" | "paused" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancePriceItem {
  id: string;
  name: string;
  description: string | null;
  unit_price: number;
  currency: Currency;
  image_url: string | null;
  category: string | null;
  created_at: string;
}

export interface FinanceInvoiceItem {
  id?: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  position: number;
}

export interface FinanceInvoice {
  id: string;
  invoice_number: string;
  project_id: string | null;
  milestone_id: string | null;
  client_name: string;
  client_email: string | null;
  client_address: string | null;
  currency: Currency;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total: number;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  scope: "custom" | "project" | "milestone" | "monthly";
  period_month: string | null;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  public_token: string;
  marketer_code?: string | null;
  marketer_user_id?: string | null;
  marketer_attributed_at?: string | null;
  created_at: string;
  items?: FinanceInvoiceItem[];
  payment_terms?: string | null;
  revisions_note?: string | null;
  working_hours?: string | null;
  delivery_speed?: "standard" | "express" | "super_express" | "flash" | null;
  delivery_period?: string | null;
}

export interface InvoicePaymentSubmission {
  id: string;
  invoice_id: string;
  method: "bank_transfer" | "paystack";
  status: "pending" | "confirmed" | "rejected" | "cancelled";
  amount: number;
  currency: Currency;
  payer_name: string | null;
  payer_email: string | null;
  transfer_reference: string | null;
  proof_file_name: string | null;
  proof_mime_type: string | null;
  proof_size_bytes: number | null;
  proof_url?: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_note: string | null;
}

export interface FinanceReceipt {
  id: string;
  receipt_number: string;
  invoice_id: string;
  public_token: string;
  client_name: string;
  client_email: string | null;
  amount: number;
  currency: Currency;
  payment_method: "bank_transfer" | "paystack" | string;
  payment_reference: string | null;
  paid_at: string;
  emailed_at: string | null;
  created_at: string;
  invoice_number?: string;
  invoice?: FinanceInvoice;
  items?: FinanceInvoiceItem[];
}

export interface FinanceBankAccount {
  id?: string;
  currency: Currency;
  country_code?: string | null;
  bank_name: string;
  account_name: string;
  account_number: string | null;
  iban?: string | null;
  swift_bic?: string | null;
  routing_number?: string | null;
  bank_address?: string | null;
  instructions?: string | null;
  logo_url?: string | null;
  active?: boolean;
  sort_order?: number;
}

export interface FinanceQuotationItem {
  id?: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  position: number;
}

export type FinanceQuotationStatus = "draft" | "sent" | "accepted" | "converted" | "cancelled";

export interface FinanceQuotationSample {
  id?: string;
  kind: "image" | "link";
  url: string;
  label: string | null;
  position: number;
}

export interface FinanceQuotation {
  id: string;
  quotation_number: string;
  user_id?: string | null;
  project_id: string | null;
  milestone_id: string | null;
  converted_invoice_id: string | null;
  project_name: string;
  client_name: string;
  client_email: string | null;
  client_address: string | null;
  currency: Currency;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total: number;
  status: FinanceQuotationStatus;
  scope: "custom" | "project" | "milestone" | "monthly";
  period_month: string | null;
  issue_date: string;
  valid_until: string | null;
  notes: string | null;
  estimate_note: string | null;
  revisions_note: string | null;
  working_hours: string | null;
  delivery_period: string | null;
  public_token: string;
  converted_at: string | null;
  created_at: string;
  items?: FinanceQuotationItem[];
  samples?: FinanceQuotationSample[];
}

export const DELIVERY_SPEEDS = [
  { value: "standard",      label: "Standard",      helper: "Client's regular schedule",   surchargeType: "none"  as const, defaultSurcharge: 0    },
  { value: "express",       label: "Express",       helper: "Priority handling",           surchargeType: "pct"   as const, defaultSurcharge: 15   },
  { value: "super_express", label: "Super Express", helper: "Top of the queue",            surchargeType: "pct"   as const, defaultSurcharge: 30   },
  { value: "flash",         label: "Flash",         helper: "Same-day / fastest possible", surchargeType: "pct"   as const, defaultSurcharge: 50   },
] as const;

export type DeliverySpeed = typeof DELIVERY_SPEEDS[number]["value"];

export function deliverySpeedLabel(v: DeliverySpeed | null | undefined): string {
  return DELIVERY_SPEEDS.find((s) => s.value === v)?.label || "Standard";
}

export function deliverySpeedMeta(v: DeliverySpeed | null | undefined) {
  return DELIVERY_SPEEDS.find((s) => s.value === v) ?? DELIVERY_SPEEDS[0];
}

export const DEFAULT_PAYMENT_TERMS = "100% Upfront Payment. Payment is not Refundable";
export const DEFAULT_REVISIONS_NOTE = "Designs are subject to Free 2 Revisions";
export const DEFAULT_WORKING_HOURS = "9am–5:30pm Monday–Friday  UTC+1";
export const DEFAULT_QUOTATION_ESTIMATE_NOTE = "This quotation is a rough estimate for the project delivery. Final scope, timeline, and cost may change after confirmation.";
export const QUOTATION_DELIVERY_PERIODS = [
  "3 business days",
  "5-7 days",
  "2-3 weeks",
  "4-6 weeks",
  "7-10 weeks",
  "3-6 months",
  "12-18 months",
] as const;

// Legacy Nigerian account data. New invoices receive currency-matched account
// records from Sales settings; this remains a safe NGN fallback while older
// deployments are upgraded.
export const CDS_BANK_ACCOUNTS = [
  {
    bank: "Kuda Bank",
    account_name: "CDS Space Branding Agency Ltd",
    account_number: "3002258183",
    color: "#40196D", // kuda purple
    initial: "K",
    logo: "/kuda.png",
  },
  {
    bank: "Wema Bank",
    account_name: "CDS Space Branding Agency Ltd",
    account_number: "0126148969",
    color: "#8A1A5A", // wema purple
    initial: "W",
    logo: "/wemabank.png",
  },
] as const;

export interface FinanceSubscription {
  id: string;
  project_id: string | null;
  name: string;
  category: string | null;
  amount: number;
  currency: Currency;
  billing_cycle: "monthly" | "quarterly" | "yearly";
  next_due_date: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface FinanceInflow {
  id: string;
  project_id: string | null;
  title: string;
  source: string | null;
  amount: number;
  currency: Currency;
  received_on: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinanceContractor {
  id: string;
  name: string;
  business_niche: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  bank_code: string | null;
  office_location: string | null;
  start_date: string | null;
  notes: string | null;
  source: "admin" | "public";
  created_at: string;
}

export interface FinanceContractorAssignment {
  id: string;
  contractor_id: string;
  project_id: string;
  milestone_id: string | null;
  agreed_amount: number;
  currency: Currency;
  notes: string | null;
  created_at: string;
  project?: { name: string; client: string };
}

export interface FinanceContractorPayment {
  id: string;
  contractor_id: string;
  project_id: string | null;
  amount: number;
  currency: Currency;
  paid_on: string;
  payment_ref: string | null;
  proof_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface FinanceExpenditure {
  id: string;
  title: string;
  category: string | null;
  amount: number;
  currency: Currency;
  spent_on: string;
  recurring: boolean;
  recurrence_cycle: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom" | null;
  custom_interval_days?: number | null;
  next_due_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface FinanceEmployee {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  bank_name: string | null;
  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
  base_salary: number | null;
  currency: Currency;
  active: boolean;
  created_at: string;
}

export interface FinancePayrollRun {
  id: string;
  title: string;
  period: string;
  status: "draft" | "processed" | "paid";
  total: number;
  currency: Currency;
  created_at: string;
}

export interface FinancePayrollItem {
  id: string;
  payroll_run_id: string;
  employee_id: string | null;
  account_number: string;
  amount: number;
  bank_code: string;
  narration: string;
}

export function generateInvoiceNumber() {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${ym}-${rand}`;
}

export function generateQuotationNumber() {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `QUO-${ym}-${rand}`;
}

export function randomToken(len = 32) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export interface FinanceMilestone {
  id: string;
  project_id: string;
  description: string;
  budget: number;
  assigned_to: string | null;
  duration_start: string | null;
  duration_end: string | null;
  payment_basis: "milestone" | "monthly";
  monthly_amount: number | null;
  paid_amount: number;
  status: "pending" | "in_progress" | "completed" | "paid";
  position: number;
  created_at: string;
}
