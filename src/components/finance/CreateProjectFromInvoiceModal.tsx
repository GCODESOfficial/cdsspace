"use client";

import { useState } from "react";
import { X, FolderPlus, Loader2 } from "lucide-react";
import { appAlert } from "@/lib/app-notify";
import { CURRENCIES } from "@/lib/finance/types";

/** The subset of an invoice we read to seed a project. */
export interface InvoiceForProject {
  id: string;
  invoice_number: string;
  client_email?: string | null;
  currency: string;
  scope?: string | null;
  notes?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  delivery_period?: string | null;
  delivery_speed?: string | null;
  working_hours?: string | null;
  revisions_note?: string | null;
}

const dateOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

/**
 * Compose the project notes from the invoice's work-oriented fields only.
 * Deliberately excludes client name, amount, and contact details.
 */
function seedNotes(inv: InvoiceForProject): string {
  const lines: string[] = [];
  if (inv.scope?.trim()) lines.push(inv.scope.trim());
  const delivery = [inv.delivery_period, inv.delivery_speed].filter(Boolean).join(" · ");
  if (delivery) lines.push(`Delivery: ${delivery}`);
  if (inv.working_hours) lines.push(`Working hours: ${inv.working_hours}`);
  if (inv.revisions_note) lines.push(`Revisions: ${inv.revisions_note}`);
  if (inv.notes?.trim()) lines.push(inv.notes.trim());
  if (lines.length) lines.push("");
  lines.push(`Created from invoice ${inv.invoice_number}.`);
  return lines.join("\n");
}

interface Props {
  invoice: InvoiceForProject;
  onClose: () => void;
  onCreated?: () => void;
}

export default function CreateProjectFromInvoiceModal({ invoice, onClose, onCreated }: Props) {
  const [name, setName] = useState(invoice.scope?.trim()?.split("\n")[0]?.slice(0, 80) || `Project - ${invoice.invoice_number}`);
  const [client, setClient] = useState(""); // intentionally blank - filled by admin
  const [clientEmail, setClientEmail] = useState(invoice.client_email || "");
  const [currency, setCurrency] = useState(CURRENCIES.includes(invoice.currency as never) ? invoice.currency : "NGN");
  const [start, setStart] = useState(dateOnly(invoice.issue_date));
  const [end, setEnd] = useState(dateOnly(invoice.due_date));
  const [notes, setNotes] = useState(() => seedNotes(invoice));
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) { appAlert("Project name is required."); return; }
    if (!client.trim()) { appAlert("Add the client / brand for this project."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/finance/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), client: client.trim(), client_email: clientEmail.trim() || null, currency,
          duration_start: start || null, duration_end: end || null, notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.project) throw new Error(json.error || "Could not create project");
      // Link the invoice to the new project so the relationship is recorded.
      await fetch(`/api/admin/finance/invoices/${invoice.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: json.project.id }),
      }).catch(() => {});
      onCreated?.();
      onClose();
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not create project");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[88vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 grid place-items-center shrink-0"><FolderPlus className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-[#0D1B39]">Invoice paid - create a project?</h2>
              <p className="text-[13px] text-gray-500">{invoice.invoice_number} is settled. Spin up a project with the details pre-filled, or ignore.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#0D1B39]">Project name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#0D1B39]">Client / brand</label>
              <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Enter client name" className={field} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#0D1B39]">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[12px] font-semibold text-[#0D1B39]">Client account email</label>
              <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@example.com" className={field} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#0D1B39]">Start date</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={field} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#0D1B39]">End date</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#0D1B39]">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className={`${field} resize-none leading-relaxed`} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50">Ignore</button>
          <button onClick={create} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />} Create project
          </button>
        </div>
      </div>
    </div>
  );
}
