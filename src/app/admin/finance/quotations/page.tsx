'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, CheckCircle2, Copy, FileText, Plus, Search, Send, Share2, Trash2, X, Mail, Loader2 } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import StatCard from "@/components/finance/StatCard";
import ActivityPanel from "@/components/admin/ActivityPanel";
import { Currency, formatFinanceDate, formatMoney } from "@/lib/finance/types";
import { buildQuotationShareMessage } from "@/lib/finance/share";
import { appAlert, appConfirm, appToast } from "@/lib/app-notify";
import { useFinanceDisplayCurrency } from "@/components/finance/FinanceCurrencySelector";
import { convertFinanceAmount } from "@/lib/finance/currency-display";

interface Row {
  id: string;
  quotation_number: string;
  project_name: string;
  client_name: string;
  currency: Currency;
  total: number;
  status: string;
  issue_date: string;
  valid_until: string | null;
  public_token: string;
  converted_invoice_id: string | null;
}

const STATUS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
  sent: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  converted: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  cancelled: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

export default function QuotationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const { currency: displayCurrency, rates } = useFinanceDisplayCurrency();

  const load = () => {
    setLoading(true);
    fetch("/api/admin/finance/quotations")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.quotations ?? []);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = (ids: string[]) => {
    setSelected((s) => {
      if (ids.every((id) => s.has(id))) return new Set();
      return new Set(ids);
    });
  };

  const clearSelection = () => setSelected(new Set());

  const bulkPatch = async (status: string) => {
    setWorking(true);
    await Promise.all(Array.from(selected).map((id) =>
      fetch(`/api/admin/finance/quotations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
    ));
    setWorking(false);
    clearSelection();
    load();
  };

  const bulkDelete = async () => {
    if (!(await appConfirm(`Delete ${selected.size} quotation${selected.size === 1 ? "" : "s"}? This cannot be undone.`))) return;
    setWorking(true);
    await Promise.all(Array.from(selected).map((id) => fetch(`/api/admin/finance/quotations/${id}`, { method: "DELETE" })));
    setWorking(false);
    clearSelection();
    load();
  };

  const bulkDuplicate = async () => {
    setWorking(true);
    try {
      for (const id of selected) {
        const res = await fetch(`/api/admin/finance/quotations/${id}`);
        const { quotation, items, samples } = await res.json();
        await fetch("/api/admin/finance/quotations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...quotation,
            id: undefined,
            quotation_number: undefined,
            public_token: undefined,
            converted_invoice_id: undefined,
            converted_at: undefined,
            created_at: undefined,
            status: "draft",
            items: (items ?? []).map((it: any) => ({
              name: it.name,
              description: it.description,
              quantity: it.quantity,
              unit_price: it.unit_price,
              position: it.position,
            })),
            samples: (samples ?? []).map((sample: any) => ({
              kind: sample.kind,
              url: sample.url,
              label: sample.label,
              position: sample.position,
            })),
          }),
        });
      }
      appAlert(`Duplicated ${selected.size} quotation(s) as drafts.`);
    } catch (e) {
      console.error("Quotation duplication failed", e);
      appAlert("Failed to duplicate some quotations.");
    }
    setWorking(false);
    clearSelection();
    load();
  };

  const bulkShare = async () => {
    const messages: string[] = [];
    const origin = window.location.origin;
    for (const id of selected) {
      const res = await fetch(`/api/admin/finance/quotations/${id}`);
      const { quotation } = await res.json();
      if (quotation?.public_token) {
        messages.push(buildQuotationShareMessage(quotation.quotation_number, `${origin}/quotation/${quotation.public_token}`));
      }
    }
    if (messages.length > 0) {
      await navigator.clipboard.writeText(messages.join("\n\n"));
      appAlert(`${messages.length} quotation share message(s) copied to clipboard.`);
    }
    clearSelection();
  };

  const emailQuotation = async (id: string) => {
    setEmailingId(id);
    try {
      const r = await fetch("/api/admin/finance/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "quotation", id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed to send");
      appToast({ message: `Quotation emailed to ${j.to}`, kind: "success" });
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not send the email");
    } finally {
      setEmailingId(null);
    }
  };

  const bulkEmail = async () => {
    setWorking(true);
    let sent = 0;
    let failed = 0;
    await Promise.all(
      Array.from(selected).map(async (id) => {
        try {
          const r = await fetch("/api/admin/finance/share", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "quotation", id }),
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j.ok) sent++; else failed++;
        } catch {
          failed++;
        }
      }),
    );
    setWorking(false);
    clearSelection();
    appAlert(`Emailed ${sent} quotation${sent === 1 ? "" : "s"}${failed ? ` · ${failed} skipped (no client email?)` : ""}.`);
  };

  const convertQuotation = async (row: Row) => {
    if (row.converted_invoice_id) {
      window.location.href = `/admin/finance/invoices/${row.converted_invoice_id}`;
      return;
    }
    if (!(await appConfirm(`Convert ${row.quotation_number} to a draft invoice?`))) return;
    const r = await fetch(`/api/admin/finance/quotations/${row.id}/convert`, { method: "POST" });
    const d = await r.json();
    if (!r.ok) {
      appAlert(d?.error || "Couldn't convert quotation.");
      return;
    }
    window.location.href = `/admin/finance/invoices/${d.invoice.id}`;
  };

  const filtered = rows.filter((r) =>
    r.quotation_number.toLowerCase().includes(search.toLowerCase()) ||
    r.project_name.toLowerCase().includes(search.toLowerCase()) ||
    r.client_name.toLowerCase().includes(search.toLowerCase())
  );

  const totals = rows.reduce(
    (acc, r) => {
      if (r.status !== "cancelled") acc.estimate += convertFinanceAmount(r.total, r.currency, displayCurrency, rates);
      if (r.status === "accepted") acc.accepted += 1;
      if (r.status === "converted") acc.converted += 1;
      return acc;
    },
    { estimate: 0, accepted: 0, converted: 0 }
  );

  return (
    <FinanceShell
      title="Quotations"
      subtitle="Create rough project estimates outside the books."
      actions={
        <Link href="/admin/finance/quotations/new">
          <Button className="h-11 px-5 rounded-xl bg-[#0A4FE8] shadow-lg shadow-blue-600/30">
            <Plus className="w-4 h-4 mr-1.5" /> New Quotation
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatCard icon={FileText} label="Total Quotations" value={String(rows.length)} accent="bg-[#0A4FE8]" />
        <StatCard icon={CheckCircle2} label="Accepted" value={String(totals.accepted)} accent="from-emerald-500 to-teal-500" />
        <StatCard icon={FileText} label={`Estimated Pipeline · ${displayCurrency}`} value={formatMoney(totals.estimate, displayCurrency)} accent="from-amber-500 to-orange-500" />
      </div>

      <div className={`${glassCard} p-4 mb-6 flex items-center gap-3`}>
        <Search className="w-5 h-5 text-gray-400 ml-2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by quotation, project, or client..." className="flex-1 bg-transparent outline-none text-sm" />
      </div>

      {loading ? (
        <div className={`${glassCard} p-10 text-center text-gray-500`}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className={`${glassCard} p-14 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-blue-50 grid place-items-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No quotations yet</h3>
          <p className="text-gray-500 mt-1">Create a rough estimate before it becomes an invoice.</p>
        </div>
      ) : (
        <>
          {selected.size > 0 && (
            <div className={`${glassCard} p-3 mb-4 flex items-center gap-3 border border-blue-200 bg-blue-50/60`}>
              <div className="flex items-center gap-2 px-2">
                <span className="w-7 h-7 rounded-lg bg-blue-600 text-white text-xs font-bold grid place-items-center">{selected.size}</span>
                <span className="text-sm font-medium text-gray-700">selected</span>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <button disabled={working} onClick={() => bulkPatch("sent")} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Mark Sent
                </button>
                <button disabled={working} onClick={() => bulkPatch("accepted")} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Accept
                </button>
                <button disabled={working} onClick={() => bulkPatch("cancelled")} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 transition disabled:opacity-50">
                  Cancel
                </button>
                <div className="w-[1px] h-6 bg-gray-200 mx-1" />
                <button disabled={working} onClick={bulkDuplicate} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" /> Duplicate
                </button>
                <button disabled={working} onClick={bulkEmail} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Email
                </button>
                <button disabled={working} onClick={bulkShare} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5" /> Copy Messages
                </button>
                <button disabled={working} onClick={bulkDelete} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <button onClick={clearSelection} className="w-8 h-8 rounded-lg hover:bg-white/70 grid place-items-center text-gray-500 hover:text-gray-800">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className={`${glassCard} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead className="bg-white/50">
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="pl-5 pr-2 py-4 w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                      onChange={() => toggleAll(filtered.map((r) => r.id))}
                    />
                  </th>
                  <th className="px-5 py-4">Quotation</th>
                  <th className="px-5 py-4">Project / Company</th>
                  <th className="px-5 py-4">Client</th>
                  <th className="px-5 py-4">Issued</th>
                  <th className="px-5 py-4">Estimate</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isSel = selected.has(r.id);
                  return (
                    <tr key={r.id} className={`border-t border-white/60 transition ${isSel ? "bg-blue-50/60" : "hover:bg-white/50"}`}>
                      <td className="pl-5 pr-2 py-4">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={isSel}
                          onChange={() => toggleOne(r.id)}
                        />
                      </td>
                      <td className="px-5 py-4 font-mono font-semibold text-gray-900">{r.quotation_number}</td>
                      <td className="px-5 py-4">{r.project_name}</td>
                      <td className="px-5 py-4">{r.client_name}</td>
                      <td className="px-5 py-4 text-gray-500">{formatFinanceDate(r.issue_date)}</td>
                      <td className="px-5 py-4 font-semibold">{formatMoney(convertFinanceAmount(r.total, r.currency, displayCurrency, rates), displayCurrency)}{r.currency !== displayCurrency && <small className="block text-[9px] font-medium text-gray-400">Original: {formatMoney(r.total, r.currency)}</small>}</td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${STATUS[r.status] ?? STATUS.draft}`}>{r.status}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {r.status !== "cancelled" && (
                            <button
                              onClick={() => convertQuotation(r)}
                              className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition"
                            >
                              {r.converted_invoice_id ? "Open Invoice" : "Convert"}
                            </button>
                          )}
                          <button
                            onClick={() => emailQuotation(r.id)}
                            disabled={emailingId === r.id}
                            title="Email to client"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50"
                          >
                            {emailingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Email
                          </button>
                          <Link href={`/admin/finance/quotations/${r.id}`} className="text-blue-600 hover:underline text-xs font-medium">Open -&gt;</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ActivityPanel page="finance/quotations" title="Quotation activity" />
        </>
      )}
    </FinanceShell>
  );
}
