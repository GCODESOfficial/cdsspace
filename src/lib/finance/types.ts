export type Currency = "NGN" | "RWF" | "USD";

export const CURRENCIES: Currency[] = ["NGN", "RWF", "USD"];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  NGN: "₦",
  RWF: "FRw ",
  USD: "$",
};

export function formatMoney(amount: number | string | null | undefined, currency: Currency = "NGN") {
  const n = Number(amount ?? 0);
  return `${CURRENCY_SYMBOLS[currency]}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface FinanceProject {
  id: string;
  name: string;
  client: string;
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
  created_at: string;
  items?: FinanceInvoiceItem[];
}

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
  recurrence_cycle: "monthly" | "quarterly" | "yearly" | null;
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
