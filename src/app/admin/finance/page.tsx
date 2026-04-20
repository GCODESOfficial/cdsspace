'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import { supabase } from "@/lib/supabase";
import {
  Briefcase, Tag, FileText, Repeat, Users, Receipt, Wallet, BarChart3, ArrowUpRight,
  TrendingUp, TrendingDown, DollarSign, Activity, AlertCircle, CheckCircle2, Clock, Loader2,
} from "lucide-react";

const SECTIONS = [
  { href: "/admin/finance/projects",      label: "Projects",      desc: "Create & manage projects and milestones",    icon: Briefcase, tint: "from-blue-500 to-indigo-500" },
  { href: "/admin/finance/price-list",    label: "Price List",    desc: "Products & services with unit prices",       icon: Tag,       tint: "from-fuchsia-500 to-pink-500" },
  { href: "/admin/finance/invoices",      label: "Invoices",      desc: "Generate, send & track invoices",             icon: FileText,  tint: "from-emerald-500 to-teal-500" },
  { href: "/admin/finance/subscriptions", label: "Subscriptions", desc: "Recurring tools, servers & services",         icon: Repeat,    tint: "from-amber-500 to-orange-500" },
  { href: "/admin/finance/contractors",   label: "Contractors",   desc: "Team & contractor payments",                  icon: Users,     tint: "from-violet-500 to-purple-500" },
  { href: "/admin/finance/expenditures",  label: "Expenditures",  desc: "Track all outgoing spend",                    icon: Receipt,   tint: "from-rose-500 to-red-500" },
  { href: "/admin/finance/payroll",       label: "Payroll",       desc: "Employees & bank payroll exports",            icon: Wallet,    tint: "from-cyan-500 to-sky-500" },
  { href: "/admin/finance/dashboard",     label: "Detailed",      desc: "Full financial summary",                      icon: BarChart3, tint: "from-slate-700 to-slate-900" },
];

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
  monthlySubscriptionsCost: number;
  outstandingPayables: number;
  recentInvoices: any[];
  recentExpenses: any[];
}

const formatCurrency = (n: number) => `₦${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

export default function FinanceHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [
          projectsRes,
          invoicesRes,
          expendituresRes,
          contractorsRes,
          employeesRes,
          subscriptionsRes,
          contractorPaymentsRes,
        ] = await Promise.all([
          supabase.from("finance_projects").select("id, status"),
          supabase.from("finance_invoices").select("id, total, status, currency, client_name, issue_date, due_date").order("created_at", { ascending: false }),
          supabase.from("finance_expenditures").select("id, amount, currency, title, spent_on").order("spent_on", { ascending: false }),
          supabase.from("finance_contractors").select("id"),
          supabase.from("finance_employees").select("id, base_salary").eq("active", true),
          supabase.from("finance_subscriptions").select("id, amount, billing_cycle, active").eq("active", true),
          supabase.from("finance_contractor_payments").select("amount"),
        ]);

        const projects = projectsRes.data || [];
        const invoices = invoicesRes.data || [];
        const expenditures = expendituresRes.data || [];
        const contractors = contractorsRes.data || [];
        const employees = employeesRes.data || [];
        const subscriptions = subscriptionsRes.data || [];
        const contractorPayments = contractorPaymentsRes.data || [];

        const totalRevenue = invoices.filter(i => i.status === "paid").reduce((sum, i) => sum + Number(i.total || 0), 0);
        const totalExpenses =
          expenditures.reduce((sum, e) => sum + Number(e.amount || 0), 0) +
          contractorPayments.reduce((sum, c) => sum + Number(c.amount || 0), 0) +
          employees.reduce((sum, e) => sum + Number(e.base_salary || 0), 0);

        const monthlySubscriptionsCost = subscriptions.reduce((sum, s) => {
          const amt = Number(s.amount || 0);
          if (s.billing_cycle === "monthly") return sum + amt;
          if (s.billing_cycle === "quarterly") return sum + amt / 3;
          if (s.billing_cycle === "yearly") return sum + amt / 12;
          return sum;
        }, 0);

        const outstandingPayables = invoices
          .filter(i => i.status === "sent" || i.status === "overdue")
          .reduce((sum, i) => sum + Number(i.total || 0), 0);

        setStats({
          totalRevenue,
          totalExpenses,
          netProfit: totalRevenue - totalExpenses,
          totalProjects: projects.length,
          activeProjects: projects.filter(p => p.status === "active").length,
          completedProjects: projects.filter(p => p.status === "completed").length,
          totalInvoices: invoices.length,
          paidInvoices: invoices.filter(i => i.status === "paid").length,
          pendingInvoices: invoices.filter(i => i.status === "sent" || i.status === "draft").length,
          overdueInvoices: invoices.filter(i => i.status === "overdue").length,
          totalContractors: contractors.length,
          totalEmployees: employees.length,
          monthlySubscriptionsCost,
          outstandingPayables,
          recentInvoices: invoices.slice(0, 5),
          recentExpenses: expenditures.slice(0, 5),
        });
      } catch (error) {
        console.error("Failed to load finance stats:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, []);

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
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatCurrency(stats.totalRevenue)}</p>
                <p className="text-sm text-gray-500 mt-1">Total earnings from paid invoices</p>
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
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatCurrency(stats.totalExpenses)}</p>
                <p className="text-sm text-gray-500 mt-1">Spend, contractors & payroll</p>
              </div>
            </div>

            {/* Net Profit / Loss */}
            <div className={`${glassCard} p-6 relative overflow-hidden`}>
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl ${stats.netProfit >= 0 ? "bg-gradient-to-br from-blue-200/50 to-transparent" : "bg-gradient-to-br from-amber-200/50 to-transparent"}`} />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br grid place-items-center shadow-lg ${stats.netProfit >= 0 ? "from-blue-500 to-indigo-600 shadow-blue-500/20" : "from-amber-500 to-orange-600 shadow-amber-500/20"}`}>
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${stats.netProfit >= 0 ? "text-blue-600 bg-blue-50" : "text-amber-600 bg-amber-50"}`}>
                    {stats.netProfit >= 0 ? "NET PROFIT" : "NET LOSS"}
                  </span>
                </div>
                <p className={`text-3xl font-bold tabular-nums ${stats.netProfit >= 0 ? "text-gray-900" : "text-amber-600"}`}>
                  {stats.netProfit >= 0 ? "" : "-"}{formatCurrency(Math.abs(stats.netProfit))}
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
            <MiniMetric icon={<Repeat className="w-4 h-4 text-amber-600" />} label="Monthly Subs" value={formatCurrency(stats.monthlySubscriptionsCost)} sub="Recurring cost" bg="bg-amber-50" valueIsString />
          </div>

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
                    <p className="text-[13px] font-semibold text-amber-900">{formatCurrency(stats.outstandingPayables)} outstanding</p>
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
                        <p className="text-[11px] text-gray-400">{new Date(inv.issue_date).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold tabular-nums text-gray-700">{formatCurrency(Number(inv.total))}</span>
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
                      <span className="text-[13px] font-semibold tabular-nums text-rose-600">-{formatCurrency(Number(exp.amount))}</span>
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
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${s.tint} grid place-items-center shadow-lg shadow-blue-600/10`}>
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
