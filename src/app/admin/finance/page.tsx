'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import { supabase } from "@/lib/supabase";
import { formatFinanceDate, formatMoney, type Currency } from "@/lib/finance/types";
import { useFinanceDisplayCurrency } from "@/components/finance/FinanceCurrencySelector";
import { convertFinanceAmount } from "@/lib/finance/currency-display";
import { appAlert, appConfirm, appToast } from "@/lib/app-notify";
import {
  ArrowDownToLine, Briefcase, Tag, FileText, Users, Receipt, Wallet, BarChart3, ArrowUpRight,
  TrendingUp, TrendingDown, DollarSign, AlertCircle, Clock, Loader2, ScrollText, Check, ShieldCheck,
} from "lucide-react";

const SECTIONS = [
  { href: "/admin/finance/projects",      label: "Projects",      desc: "Create & manage projects and milestones",    icon: Briefcase, tint: "bg-[#0A4FE8]" },
  { href: "/admin/finance/price-list",    label: "Price List",    desc: "Products & services with unit prices",       icon: Tag,       tint: "from-fuchsia-500 to-pink-500" },
  { href: "/admin/finance/invoices",      label: "Invoices",      desc: "Generate, send & track invoices",             icon: FileText,  tint: "from-emerald-500 to-teal-500" },
  { href: "/admin/finance/quotations",    label: "Quotations",    desc: "Rough estimates before invoicing",             icon: ScrollText, tint: "bg-[#0A4FE8]" },
  { href: "/admin/finance/subscriptions", label: "Inflow",        desc: "Record positive money received",              icon: ArrowDownToLine, tint: "from-emerald-500 to-teal-500" },
  { href: "/admin/finance/contractors",   label: "Contractors",   desc: "Team & contractor payments",                  icon: Users,     tint: "from-violet-500 to-purple-500" },
  { href: "/admin/finance/expenditures",  label: "Expenditures",  desc: "Track all outgoing spend",                    icon: Receipt,   tint: "from-rose-500 to-red-500" },
  { href: "/admin/finance/payroll",       label: "Payroll",       desc: "Employees & bank payroll exports",            icon: Wallet,    tint: "bg-[#0A4FE8]" },
  { href: "/admin/finance/audit",       label: "Detailed",      desc: "Full financial summary",                      icon: BarChart3, tint: "from-slate-700 to-slate-900" },
];

interface RecentInvoice {
  id: string;
  client_name: string;
  issue_date: string;
  total: number | string;
  status: string;
  currency: Currency;
  amount_paid?: number | string;
  balance_due?: number | string;
  payment_percentage?: number | string;
}

interface RecentExpense {
  id: string;
  title: string;
  spent_on: string;
  amount: number | string;
  currency: Currency;
}

type FinanceInvoiceRow = RecentInvoice & { due_date?: string | null };
type FinanceExpenseRow = RecentExpense;
type FinanceProjectRow = { id: string; status: string };
type CurrencyAmountRow = { amount: number | string; currency: Currency };
type FinanceEmployeeRow = { id: string; base_salary: number | string | null; currency: Currency };

interface PendingPaymentSubmission {
  id: string;
  status: string;
  submitted_at: string;
  amount: number | string;
  currency: Currency;
  transfer_reference?: string | null;
}

interface PendingPaymentConfirmation {
  invoice: {
    id: string;
    invoice_number: string;
    client_name: string;
    total: number | string;
    currency: Currency;
  };
  submission: PendingPaymentSubmission;
}

interface Stats {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
  totalContractors: number;
  totalEmployees: number;
  totalInflow: number;
  outstandingPayables: number;
  recentInvoices: RecentInvoice[];
  recentExpenses: RecentExpense[];
  pendingPaymentConfirmations: PendingPaymentConfirmation[];
}

export default function FinanceHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewingPayment, setReviewingPayment] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { currency: displayCurrency, rates } = useFinanceDisplayCurrency();
  const display = (amount: number | string | null | undefined, source: Currency | string | null | undefined) =>
    convertFinanceAmount(amount, source, displayCurrency, rates);

  useEffect(() => {
    async function loadStats() {
      try {
        const [
          projectsRes,
          invoicesRes,
          expendituresRes,
          contractorsRes,
          employeesRes,
          inflowsRes,
          contractorPaymentsRes,
          invoiceQueueRes,
        ] = await Promise.all([
          supabase.from("finance_projects").select("id, status"),
          supabase.from("finance_invoices").select("id, total, amount_paid, balance_due, payment_percentage, status, currency, client_name, issue_date, due_date").order("created_at", { ascending: false }),
          supabase.from("finance_expenditures").select("id, amount, currency, title, spent_on").order("spent_on", { ascending: false }),
          supabase.from("finance_contractors").select("id"),
          supabase.from("finance_employees").select("id, base_salary, currency").eq("active", true),
          supabase.from("finance_inflows").select("id, title, source, amount, currency, received_on").order("received_on", { ascending: false }),
          supabase.from("finance_contractor_payments").select("amount, currency"),
          fetch("/api/admin/finance/invoices", { cache: "no-store" }),
        ]);

        const projects = (projectsRes.data || []) as FinanceProjectRow[];
        const invoices = (invoicesRes.data || []) as FinanceInvoiceRow[];
        const expenditures = (expendituresRes.data || []) as FinanceExpenseRow[];
        const contractors = contractorsRes.data || [];
        const employees = (employeesRes.data || []) as FinanceEmployeeRow[];
        const inflows = (inflowsRes.data || []) as CurrencyAmountRow[];
        const contractorPayments = (contractorPaymentsRes.data || []) as CurrencyAmountRow[];
        const invoiceQueuePayload = invoiceQueueRes.ok ? await invoiceQueueRes.json().catch(() => ({})) : {};
        const pendingPaymentConfirmations = ((invoiceQueuePayload.invoices || []) as Array<{
          id: string;
          invoice_number: string;
          client_name: string;
          total: number | string;
          currency: Currency;
          invoice_payment_submissions?: PendingPaymentSubmission[];
        }>).flatMap((invoice) => (invoice.invoice_payment_submissions || [])
          .filter((submission) => submission.status === "pending")
          .map((submission) => ({ invoice, submission })));

        const invoiceRevenue = invoices.reduce((sum, invoice) => {
          const received = invoice.amount_paid == null
            ? (invoice.status === "paid" ? invoice.total : 0)
            : invoice.amount_paid;
          return sum + display(received, invoice.currency);
        }, 0);
        const totalInflow = inflows.reduce((sum, entry) => sum + display(entry.amount, entry.currency), 0);
        const totalRevenue = invoiceRevenue + totalInflow;
        const totalExpenses =
          expenditures.reduce((sum, e) => sum + display(e.amount, e.currency), 0) +
          contractorPayments.reduce((sum, c) => sum + display(c.amount, c.currency), 0) +
          employees.reduce((sum, e) => sum + display(e.base_salary, e.currency), 0);

        const outstandingPayables = invoices
          .filter(i => !["paid", "cancelled", "draft"].includes(i.status))
          .reduce((sum, invoice) => {
            const balance = invoice.balance_due == null
              ? Math.max(Number(invoice.total) - Number(invoice.amount_paid || 0), 0)
              : invoice.balance_due;
            return sum + display(balance, invoice.currency);
          }, 0);

        setStats({
          totalRevenue,
          totalExpenses,
          netProfit: totalRevenue - totalExpenses,
          totalProjects: projects.length,
          activeProjects: projects.filter(p => p.status === "active").length,
          completedProjects: projects.filter(p => p.status === "completed").length,
          totalInvoices: invoices.length,
          paidInvoices: invoices.filter(i => i.status === "paid").length,
          pendingInvoices: invoices.filter(i => i.status === "sent" || i.status === "draft" || i.status === "partially_paid").length,
          overdueInvoices: invoices.filter(i => i.status === "overdue").length,
          totalContractors: contractors.length,
          totalEmployees: employees.length,
          totalInflow,
          outstandingPayables,
          recentInvoices: invoices.slice(0, 5) as RecentInvoice[],
          recentExpenses: expenditures.slice(0, 5) as RecentExpense[],
          pendingPaymentConfirmations,
        });
      } catch (error) {
        console.error("Failed to load finance stats:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, [displayCurrency, rates, refreshKey]);

  const reviewPayment = async (payment: PendingPaymentConfirmation, action: "confirm" | "reject") => {
    const prompt = action === "confirm"
      ? `Confirm ${formatMoney(payment.submission.amount, payment.submission.currency)} as received and mark ${payment.invoice.invoice_number} paid?`
      : `Reject the payment submission for ${payment.invoice.invoice_number}? The invoice will remain unpaid.`;
    if (!(await appConfirm(prompt))) return;
    setReviewingPayment(payment.submission.id);
    try {
      const response = await fetch(`/api/admin/finance/invoices/${payment.invoice.id}/payment/${payment.submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Payment review failed.");
      appToast({
        message: action === "confirm" ? "Payment confirmed and receipt issued." : "Payment submission rejected.",
        kind: "success",
      });
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      appAlert(reason instanceof Error ? reason.message : "Payment review failed.");
    } finally {
      setReviewingPayment(null);
    }
  };

  return (
    <FinanceShell title="Finance" subtitle="Manage every financial moving part of CDS Space.">
      {/* Hero Metrics */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : stats && (
        <>
          {/* Top Hero Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            {/* Revenue */}
            <div className={`${glassCard} p-6 relative overflow-hidden`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-200/40 to-transparent rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 grid place-items-center shadow-lg shadow-emerald-500/20">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">REVENUE</span>
                </div>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatMoney(stats.totalRevenue, displayCurrency)}</p>
                <p className="text-sm text-gray-500 mt-1">Paid invoices plus recorded inflow</p>
              </div>
            </div>

            {/* Expenses */}
            <div className={`${glassCard} p-6 relative overflow-hidden`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-200/40 to-transparent rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 grid place-items-center shadow-lg shadow-red-500/20">
                    <TrendingDown className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-md">EXPENSES</span>
                </div>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatMoney(stats.totalExpenses, displayCurrency)}</p>
                <p className="text-sm text-gray-500 mt-1">Spend, contractors & payroll</p>
              </div>
            </div>

            {/* Net Profit / Loss */}
            <div className={`${glassCard} p-6 relative overflow-hidden`}>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-11 h-11 rounded-xl grid place-items-center shadow-lg ${stats.netProfit >= 0 ? "bg-[#0A4FE8] shadow-blue-500/20" : "bg-amber-500 shadow-amber-500/20"}`}>
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${stats.netProfit >= 0 ? "text-blue-600 bg-blue-50" : "text-amber-600 bg-amber-50"}`}>
                    {stats.netProfit >= 0 ? "NET PROFIT" : "NET LOSS"}
                  </span>
                </div>
                <p className={`text-3xl font-bold tabular-nums ${stats.netProfit >= 0 ? "text-gray-900" : "text-amber-600"}`}>
                  {stats.netProfit >= 0 ? "" : "-"}{formatMoney(Math.abs(stats.netProfit), displayCurrency)}
                </p>
                <p className="text-sm text-gray-500 mt-1">Revenue minus expenses</p>
              </div>
            </div>
          </div>

          {/* Secondary Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MiniMetric icon={<Briefcase className="w-4 h-4 text-blue-600" />} label="Total Projects" value={stats.totalProjects} sub={`${stats.activeProjects} active · ${stats.completedProjects} done`} bg="bg-blue-50" />
            <MiniMetric icon={<FileText className="w-4 h-4 text-emerald-600" />} label="Invoices" value={stats.totalInvoices} sub={`${stats.paidInvoices} paid · ${stats.pendingInvoices} pending`} bg="bg-emerald-50" />
            <MiniMetric icon={<Users className="w-4 h-4 text-violet-600" />} label="Contractors" value={stats.totalContractors} sub={`${stats.totalEmployees} employees`} bg="bg-violet-50" />
            <MiniMetric icon={<ArrowDownToLine className="w-4 h-4 text-emerald-600" />} label="Inflow" value={formatMoney(stats.totalInflow, displayCurrency)} sub="Positive funds" bg="bg-emerald-50" valueIsString />
          </div>

          {stats.pendingPaymentConfirmations.length > 0 && (
            <section className={`${glassCard} mb-6 p-5`}>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <ShieldCheck className="h-4 w-4 text-amber-600" /> Pending payment confirmations
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">Clients have marked these invoices as paid. Confirm receipt before work moves forward.</p>
                </div>
                <Link href="/admin/finance/invoices" className="text-xs font-medium text-blue-600 hover:underline">View all invoices</Link>
              </div>
              <div className="space-y-3">
                {stats.pendingPaymentConfirmations.slice(0, 5).map((payment) => (
                  <div key={payment.submission.id} className="rounded-2xl border border-slate-100 bg-white/80 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">Pending</span>
                          <span className="text-sm font-bold text-[#0D1B39]">{formatMoney(payment.submission.amount, payment.submission.currency)}</span>
                          <Link href={`/admin/finance/invoices/${payment.invoice.id}#payment-verification`} className="truncate text-xs font-medium text-blue-600 hover:underline">
                            {payment.invoice.invoice_number} · {payment.invoice.client_name}
                          </Link>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Submitted {new Date(payment.submission.submitted_at).toLocaleString()}
                          {payment.submission.transfer_reference ? ` · Ref: ${payment.submission.transfer_reference}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void reviewPayment(payment, "reject")}
                          disabled={reviewingPayment === payment.submission.id}
                          className="h-10 rounded-xl border border-red-100 px-4 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => void reviewPayment(payment, "confirm")}
                          disabled={reviewingPayment === payment.submission.id}
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {reviewingPayment === payment.submission.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm payment
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Alerts Row */}
          {(stats.overdueInvoices > 0 || stats.outstandingPayables > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {stats.overdueInvoices > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-100 grid place-items-center shrink-0">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-red-900">{stats.overdueInvoices} overdue invoice{stats.overdueInvoices !== 1 ? "s" : ""}</p>
                    <p className="text-xs text-red-700/80 mt-0.5">Follow up with clients to collect payment</p>
                  </div>
                </div>
              )}
              {stats.outstandingPayables > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 grid place-items-center shrink-0">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-amber-900">{formatMoney(stats.outstandingPayables, displayCurrency)} outstanding</p>
                    <p className="text-xs text-amber-700/80 mt-0.5">Total of unpaid sent invoices</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
            {/* Recent Invoices */}
            <div className={`${glassCard} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" /> Recent Invoices
                </h3>
                <Link href="/admin/finance/invoices" className="text-xs text-blue-600 hover:underline">View all</Link>
              </div>
              {stats.recentInvoices.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No invoices yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.recentInvoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-blue-50/40 transition">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-gray-900 truncate">{inv.client_name}</p>
                        <p className="text-[11px] text-gray-400">{formatFinanceDate(inv.issue_date)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-right text-[13px] font-semibold tabular-nums text-gray-700">
                          {formatMoney(display(inv.total, inv.currency), displayCurrency)}
                          {inv.currency !== displayCurrency && <small className="block text-[9px] font-medium text-slate-400">Original: {formatMoney(inv.total, inv.currency)}</small>}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          inv.status === "paid" ? "bg-emerald-50 text-emerald-600"
                            : inv.status === "overdue" ? "bg-red-50 text-red-600"
                            : "bg-amber-50 text-amber-600"
                        }`}>{inv.status.toUpperCase()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Expenses */}
            <div className={`${glassCard} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-rose-600" /> Recent Expenses
                </h3>
                <Link href="/admin/finance/expenditures" className="text-xs text-blue-600 hover:underline">View all</Link>
              </div>
              {stats.recentExpenses.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No expenses yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.recentExpenses.map((exp) => (
                    <div key={exp.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-rose-50/40 transition">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-gray-900 truncate">{exp.title}</p>
                        <p className="text-[11px] text-gray-400">{new Date(exp.spent_on).toLocaleDateString()}</p>
                      </div>
                      <span className="text-right text-[13px] font-semibold tabular-nums text-rose-600">-{formatMoney(display(exp.amount, exp.currency), displayCurrency)}
                        {exp.currency !== displayCurrency && <small className="block text-[9px] font-medium text-slate-400">Original: {formatMoney(exp.amount, exp.currency)}</small>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Quick Access Sections */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Quick Access</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <div className={`${glassCard} p-6 h-full transition hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(15,40,90,0.10)]`}>
              <div className="flex items-start justify-between mb-5">
                <div className={`w-12 h-12 rounded-xl bg-[#0A4FE8] grid place-items-center shadow-lg shadow-blue-600/10`}>
                  <s.icon className="w-6 h-6 text-white" />
                </div>
                <ArrowUpRight className="w-5 h-5 text-gray-300 group-hover:text-blue-600 transition" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{s.label}</h3>
              <p className="text-sm text-gray-500 mt-1">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </FinanceShell>
  );
}

function MiniMetric({
  icon, label, value, sub, bg, valueIsString,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  bg: string;
  valueIsString?: boolean;
}) {
  return (
    <div className={`${glassCard} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg ${bg} grid place-items-center`}>{icon}</div>
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-bold text-gray-900 tabular-nums ${valueIsString ? "text-xl" : "text-2xl"}`}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
