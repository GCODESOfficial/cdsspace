'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Search, CheckCircle2, Clock, Send, Trash2, X, Check, Copy, Share2 } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import StatCard from "@/components/finance/StatCard";
import { Currency, formatMoney } from "@/lib/finance/types";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface Row {
  id: string; invoice_number: string; client_name: string; currency: Currency;
  total: number; status: string; issue_date: string; due_date: string | null;
  finance_projects?: { name: string; client: string } | null;
}

const STATUS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
  sent:      "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  paid:      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  overdue:   "bg-red-50 text-red-700 ring-1 ring-red-200",
  cancelled: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

export default function InvoicesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/finance/invoices").then((r) => r.json()).then((d) => { setRows(d.invoices ?? []); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const markPaid = async (id: string) => {
    await fetch(`/api/admin/finance/invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paid" }) });
    load();
  };

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
    await Promise.all(
      Array.from(selected).map((id) =>
        fetch(`/api/admin/finance/invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
      )
    );
    setWorking(false); clearSelection(); load();
  };
  const bulkDelete = async () => {
    if (!(await appConfirm(`Delete ${selected.size} invoice${selected.size === 1 ? "" : "s"}? This cannot be undone.`))) return;
    setWorking(true);
    await Promise.all(
      Array.from(selected).map((id) => fetch(`/api/admin/finance/invoices/${id}`, { method: "DELETE" }))
    );
    setWorking(false); clearSelection(); load();
  };

  const bulkDuplicate = async () => {
    setWorking(true);
    try {
      for (const id of selected) {
        const res = await fetch(`/api/admin/finance/invoices/${id}`);
        const { invoice, items } = await res.json();
        
        // Prepare duplication payload
        const payload = {
          ...invoice,
          id: undefined,
          invoice_number: undefined,
          created_at: undefined,
          public_token: undefined,
          status: "draft",
          items: items.map((it: any) => ({
            name: it.name, description: it.description, quantity: it.quantity, unit_price: it.unit_price, position: it.position
          }))
        };
        
        await fetch("/api/admin/finance/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }
      appAlert(`Duplicated ${selected.size} invoice(s) as drafts.`);
    } catch (e) {
      console.error("Duplication failed", e);
      appAlert("Failed to duplicate some invoices");
    }
    setWorking(false); clearSelection(); load();
  };

  const bulkShare = async () => {
    const urls: string[] = [];
    const origin = window.location.origin;
    
    for (const id of selected) {
      const res = await fetch(`/api/admin/finance/invoices/${id}`);
      const { invoice } = await res.json();
      if (invoice.public_token) {
        urls.push(`${origin}/invoice/${invoice.public_token}`);
      }
    }
    
    if (urls.length > 0) {
      await navigator.clipboard.writeText(urls.join("\n"));
      appAlert(`${urls.length} share link(s) copied to clipboard.`);
    }
    clearSelection();
  };

  const filtered = rows.filter((r) =>
    r.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    r.client_name.toLowerCase().includes(search.toLowerCase())
  );

  const totals = rows.reduce(
    (acc, r) => {
      if (r.status === "paid") acc.paid += Number(r.total);
      else if (r.status !== "cancelled") acc.outstanding += Number(r.total);
      return acc;
    },
    { paid: 0, outstanding: 0 }
  );

  return (
    <FinanceShell
      title="Invoices"
      subtitle="Generate, send & track invoices."
      actions={
        <Link href="/admin/finance/invoices/new">
          <Button className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
            <Plus className="w-4 h-4 mr-1.5" /> New Invoice
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatCard icon={FileText} label="Total Invoices" value={String(rows.length)} accent="from-blue-500 to-indigo-500" />
        <StatCard icon={CheckCircle2} label="Paid" value={formatMoney(totals.paid)} accent="from-emerald-500 to-teal-500" />
        <StatCard icon={Clock} label="Outstanding" value={formatMoney(totals.outstanding)} accent="from-amber-500 to-orange-500" />
      </div>

      <div className={`${glassCard} p-4 mb-6 flex items-center gap-3`}>
        <Search className="w-5 h-5 text-gray-400 ml-2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice number or client…" className="flex-1 bg-transparent outline-none text-sm" />
      </div>

      {loading ? (
        <div className={`${glassCard} p-10 text-center text-gray-500`}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className={`${glassCard} p-14 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 grid place-items-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No invoices yet</h3>
          <p className="text-gray-500 mt-1">Create your first invoice to get started.</p>
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
                <button disabled={working} onClick={() => bulkPatch("paid")} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Mark Paid
                </button>
                <button disabled={working} onClick={() => bulkPatch("sent")} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Mark Sent
                </button>
                <button disabled={working} onClick={() => bulkPatch("cancelled")} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 transition disabled:opacity-50">
                  Cancel
                </button>
                <div className="w-[1px] h-6 bg-gray-200 mx-1" />
                <button disabled={working} onClick={bulkDuplicate} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" /> Duplicate
                </button>
                <button disabled={working} onClick={bulkShare} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5" /> Copy Links
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
                  <th className="px-5 py-4">Invoice</th>
                  <th className="px-5 py-4">Client</th>
                  <th className="px-5 py-4">Issued</th>
                  <th className="px-5 py-4">Total</th>
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
                      <td className="px-5 py-4 font-mono font-semibold text-gray-900">{r.invoice_number}</td>
                      <td className="px-5 py-4">{r.client_name}</td>
                      <td className="px-5 py-4 text-gray-500">{new Date(r.issue_date).toLocaleDateString()}</td>
                      <td className="px-5 py-4 font-semibold">{formatMoney(r.total, r.currency)}</td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${STATUS[r.status] ?? STATUS.draft}`}>{r.status}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {r.status !== "paid" && r.status !== "cancelled" && (
                            <button
                              onClick={() => markPaid(r.id)}
                              className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition"
                            >
                              Mark Paid
                            </button>
                          )}
                          <Link href={`/admin/finance/invoices/${r.id}`} className="text-blue-600 hover:underline text-xs font-medium">Open →</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </FinanceShell>
  );
}

