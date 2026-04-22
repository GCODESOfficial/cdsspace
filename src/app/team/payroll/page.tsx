"use client";

import { useEffect, useState } from "react";
import { Loader2, Wallet, Download, CheckCircle2, Clock, AlertCircle, XCircle } from "lucide-react";

interface PayrollEntry {
  id: string;
  period: string;
  period_type: string;
  gross_amount: number;
  deductions: number;
  net_amount: number;
  currency: string;
  status: "pending" | "approved" | "paid" | "cancelled";
  payment_ref: string | null;
  paid_on: string | null;
  scheduled_for: string | null;
  notes: string | null;
  created_at: string;
}

interface PayrollData {
  next_payment: PayrollEntry | null;
  ytd_paid: number;
  lifetime_paid: number;
  entries: PayrollEntry[];
}

const STATUS_META: Record<PayrollEntry["status"], { label: string; color: string; icon: any }> = {
  pending: { label: "Pending", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  approved: { label: "Approved", color: "bg-blue-50 text-blue-700 border-blue-200", icon: CheckCircle2 },
  paid: { label: "Paid", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle },
};

export default function TeamPayrollPage() {
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/team/payroll", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => j.ok && setData(j.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  function exportCSV() {
    const rows = [
      ["Period", "Type", "Gross", "Deductions", "Net", "Currency", "Status", "Paid On", "Reference"],
      ...data!.entries.map((e) => [
        e.period,
        e.period_type,
        e.gross_amount,
        e.deductions,
        e.net_amount,
        e.currency,
        e.status,
        e.paid_on ?? "",
        e.payment_ref ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cds-payroll-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-[1200px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-brand-navy tracking-tight">Payroll</h1>
          <p className="text-[13px] text-brand-body/60 mt-1">Your next payment and history.</p>
        </div>
        <button
          onClick={exportCSV}
          disabled={data.entries.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-[13px] font-semibold hover:bg-brand-navy/90 transition disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Next payment */}
      <div
        className="relative rounded-2xl p-6 md:p-8 text-white overflow-hidden"
        style={{ backgroundImage: "linear-gradient(146.28deg, #0035C1 8.83%, #0575FF 86.3%)" }}
      >
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="relative flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-[10px] uppercase tracking-[0.2em] font-semibold">
              <Wallet className="w-3 h-3" /> Next payment
            </div>
            {data.next_payment ? (
              <>
                <p className="mt-4 text-[36px] font-bold tracking-tight">
                  {currencySymbol(data.next_payment.currency)}
                  {formatNum(data.next_payment.net_amount)}
                </p>
                <p className="text-white/80 text-[13px] mt-1">
                  {data.next_payment.scheduled_for
                    ? `Scheduled for ${formatDate(data.next_payment.scheduled_for)}`
                    : "Pending scheduling"}
                  {" · "}
                  {data.next_payment.period_type.replace("_", " ")}
                </p>
              </>
            ) : (
              <>
                <p className="mt-4 text-[24px] font-semibold">No payment scheduled</p>
                <p className="text-white/70 text-[13px] mt-1">Check back after the next payroll run.</p>
              </>
            )}
          </div>

          <div className="text-right text-white/90 min-w-[180px]">
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">Paid this year</p>
              <p className="text-[20px] font-bold">₦{formatNum(data.ytd_paid)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">Lifetime</p>
              <p className="text-[16px] font-semibold">₦{formatNum(data.lifetime_paid)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl border border-brand-stroke/30 overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-stroke/20">
          <h2 className="text-[15px] font-bold text-brand-navy">
            Payment history{" "}
            <span className="text-brand-body/50 font-normal">({data.entries.length})</span>
          </h2>
        </div>

        {data.entries.length === 0 ? (
          <div className="py-16 text-center">
            <AlertCircle className="w-10 h-10 text-brand-stroke mx-auto mb-3" />
            <p className="text-[13px] text-brand-body/60">No payroll records yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left bg-brand-bg/40 text-brand-body/70 text-[11px] uppercase tracking-wider">
                  <th className="px-6 py-3 font-semibold">Period</th>
                  <th className="px-6 py-3 font-semibold">Type</th>
                  <th className="px-6 py-3 font-semibold text-right">Gross</th>
                  <th className="px-6 py-3 font-semibold text-right">Net</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-stroke/20">
                {data.entries.map((e) => {
                  const meta = STATUS_META[e.status];
                  const Icon = meta.icon;
                  return (
                    <tr key={e.id} className="hover:bg-brand-bg/30 transition">
                      <td className="px-6 py-3.5 font-mono text-brand-navy">{e.period}</td>
                      <td className="px-6 py-3.5 text-brand-body capitalize">
                        {e.period_type.replace("_", " ")}
                      </td>
                      <td className="px-6 py-3.5 text-right text-brand-body">
                        {currencySymbol(e.currency)}
                        {formatNum(e.gross_amount)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold text-brand-navy">
                        {currencySymbol(e.currency)}
                        {formatNum(e.net_amount)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${meta.color}`}
                        >
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-brand-body/70">
                        {e.paid_on ? formatDate(e.paid_on) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function currencySymbol(c: string) {
  if (c === "NGN") return "₦";
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  if (c === "GBP") return "£";
  return c + " ";
}
function formatNum(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function formatDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
