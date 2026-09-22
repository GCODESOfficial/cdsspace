'use client';

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownToLine, Banknote, CalendarDays, Edit2, Plus, ReceiptText, Trash2, TrendingUp } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import StatCard from "@/components/finance/StatCard";
import ModalHeader from "@/components/finance/ModalHeader";
import { CURRENCIES, Currency, formatMoney } from "@/lib/finance/types";
import { convertFinanceAmount } from "@/lib/finance/currency-display";
import { useFinanceDisplayCurrency } from "@/components/finance/FinanceCurrencySelector";
import { appAlert, appConfirm } from "@/lib/app-notify";

interface Inflow {
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
  finance_projects?: { name: string; client: string } | null;
}

const EMPTY: {
  project_id: string;
  title: string;
  source: string;
  amount: string;
  currency: Currency;
  received_on: string;
  payment_method: string;
  reference: string;
  notes: string;
} = {
  project_id: "",
  title: "",
  source: "",
  amount: "",
  currency: "NGN",
  received_on: new Date().toISOString().slice(0, 10),
  payment_method: "",
  reference: "",
  notes: "",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const key = value.slice(0, 10);
  const parsed = new Date(`${key}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}

export default function InflowPage() {
  const { currency: displayCurrency, rates } = useFinanceDisplayCurrency();
  const [inflows, setInflows] = useState<Inflow[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; client: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Inflow | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);

  const load = async () => {
    setLoading(true);
    const [inflowRes, projectsRes] = await Promise.all([
      fetch("/api/admin/finance/subscriptions").then((r) => r.json()),
      fetch("/api/admin/finance/projects").then((r) => r.json()),
    ]);
    setInflows(inflowRes.inflows ?? inflowRes.subscriptions ?? []);
    setProjects(projectsRes.projects ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, received_on: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  };

  const openEdit = (entry: Inflow) => {
    setEditing(entry);
    setForm({
      project_id: entry.project_id ?? "",
      title: entry.title,
      source: entry.source ?? "",
      amount: String(entry.amount),
      currency: entry.currency,
      received_on: entry.received_on?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      payment_method: entry.payment_method ?? "",
      reference: entry.reference ?? "",
      notes: entry.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    const amount = Number(form.amount);
    if (!form.title.trim() || !Number.isFinite(amount) || amount < 0) {
      appAlert("Add a title and a valid positive amount.");
      return;
    }
    const payload = {
      ...form,
      project_id: form.project_id || null,
      title: form.title.trim(),
      source: form.source.trim() || null,
      payment_method: form.payment_method.trim() || null,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
      amount,
    };
    const url = editing ? `/api/admin/finance/subscriptions/${editing.id}` : "/api/admin/finance/subscriptions";
    const method = editing ? "PATCH" : "POST";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      load();
    } else {
      const json = await response.json().catch(() => ({}));
      appAlert(json.error || "Could not save inflow.");
    }
  };

  const remove = async (id: string) => {
    if (!(await appConfirm("Delete this inflow record?"))) return;
    await fetch(`/api/admin/finance/subscriptions/${id}`, { method: "DELETE" });
    load();
  };

  const totals = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    return inflows.reduce(
      (acc, entry) => {
        const amount = convertFinanceAmount(entry.amount, entry.currency, displayCurrency, rates);
        acc.total += amount;
        if (entry.received_on?.slice(0, 7) === monthKey) acc.thisMonth += amount;
        return acc;
      },
      { total: 0, thisMonth: 0 },
    );
  }, [displayCurrency, inflows, rates]);

  return (
    <FinanceShell
      title="Inflow"
      subtitle="Record every positive fund movement and tie it into account management."
      actions={
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setEditing(null);
              setForm(EMPTY);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={openNew} className="h-11 px-5 rounded-xl bg-[#0A4FE8] shadow-lg shadow-blue-600/30">
              <Plus className="w-4 h-4 mr-1.5" /> New Inflow
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white max-w-2xl rounded-2xl border-0 shadow-2xl p-5 sm:p-7">
            <ModalHeader
              icon={ArrowDownToLine}
              title={editing ? "Edit Inflow" : "Add Inflow"}
              subtitle="Positive money received into the business"
              accent="from-emerald-500 to-teal-500"
            />
            <div className="grid gap-4 mt-2 sm:grid-cols-2">
              <Field label="Title">
                <Input className="h-11 rounded-xl" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Client deposit, cash injection" />
              </Field>
              <Field label="Source">
                <Input className="h-11 rounded-xl" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Client, investor, refund..." />
              </Field>
              <Field label="Amount">
                <Input type="number" min="0" className="h-11 rounded-xl" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label="Currency">
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Received On">
                <Input type="date" className="h-11 rounded-xl" value={form.received_on} onChange={(e) => setForm({ ...form, received_on: e.target.value })} />
              </Field>
              <Field label="Payment Method">
                <Input className="h-11 rounded-xl" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} placeholder="Transfer, cash, POS..." />
              </Field>
              <Field label="Reference">
                <Input className="h-11 rounded-xl" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Receipt, transaction ID..." />
              </Field>
              <Field label="Project (optional)">
                <Select value={form.project_id || "_none"} onValueChange={(v) => setForm({ ...form, project_id: v === "_none" ? "" : v })}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="No project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>{project.name} - {project.client}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Details">
                  <Textarea className="min-h-24 rounded-xl" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Add context, approvals, bank account, or allocation details." />
                </Field>
              </div>
            </div>
            <DialogFooter className="mt-5">
              <Button variant="outline" className="h-11 px-5 rounded-xl" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} className="h-11 px-5 rounded-xl bg-[#0A4FE8] shadow-lg shadow-blue-600/30">Save Inflow</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid grid-cols-1 gap-5 mb-8 md:grid-cols-3">
        <StatCard icon={Banknote} label="Total Inflow" value={formatMoney(totals.total, displayCurrency)} accent="from-emerald-500 to-teal-500" />
        <StatCard icon={CalendarDays} label="This Month" value={formatMoney(totals.thisMonth, displayCurrency)} accent="bg-[#0A4FE8]" />
        <StatCard icon={TrendingUp} label="Entries" value={String(inflows.length)} accent="from-fuchsia-500 to-pink-500" />
      </div>

      {loading ? (
        <div className={`${glassCard} p-10 text-center text-gray-500`}>Loading...</div>
      ) : inflows.length === 0 ? (
        <div className={`${glassCard} p-10 sm:p-14 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 grid place-items-center mx-auto mb-4">
            <ArrowDownToLine className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No inflow yet</h3>
          <p className="mt-1 text-sm text-gray-500">Add positive funds as they come into the business.</p>
        </div>
      ) : (
        <div className={`${glassCard} overflow-hidden`}>
          <div className="flex items-center gap-2 border-b border-white/70 px-5 py-4">
            <ReceiptText className="w-4 h-4 text-emerald-600" />
            <h2 className="font-semibold text-gray-900">Inflow Register</h2>
          </div>
          {/* One row per entry, carrying everything the cards did. Every inflow
              is a credit by definition, so the per-card "credit" tag is dropped
              rather than repeated down a column that could never say anything
              else. */}
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-white/50">
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-5 py-4">Inflow</th>
                <th className="px-5 py-4">Project</th>
                <th className="px-5 py-4">Received</th>
                <th className="px-5 py-4">Method</th>
                <th className="px-5 py-4">Reference</th>
                <th className="px-5 py-4 text-right">Amount</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {inflows.map((entry) => (
                <tr key={entry.id} className="border-t border-white/60 align-top hover:bg-white/50">
                  <td className="px-5 py-4">
                    <div className="font-medium text-gray-900">{entry.title}</div>
                    <div className="text-xs text-gray-500">{entry.source || "General inflow"}</div>
                    {/* The note is where the reason for the money lives, so it
                        stays on the row rather than behind an edit dialog. */}
                    {entry.notes && <div className="mt-1 max-w-[26rem] text-xs leading-5 text-gray-400">{entry.notes}</div>}
                  </td>
                  <td className="px-5 py-4 text-gray-500">
                    {entry.finance_projects
                      ? <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{entry.finance_projects.name} - {entry.finance_projects.client}</span>
                      : <span className="text-xs text-gray-400">-</span>}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-gray-500">{formatDate(entry.received_on)}</td>
                  <td className="px-5 py-4 text-gray-500">{entry.payment_method || <span className="text-gray-400">-</span>}</td>
                  <td className="px-5 py-4 text-gray-500">{entry.reference || <span className="text-gray-400">-</span>}</td>
                  <td className="px-5 py-4 text-right font-semibold whitespace-nowrap text-emerald-700">
                    <div>{formatMoney(convertFinanceAmount(entry.amount, entry.currency, displayCurrency, rates), displayCurrency)}</div>
                    {entry.currency !== displayCurrency && <div className="mt-0.5 text-[11px] font-normal text-gray-400">Original: {formatMoney(entry.amount, entry.currency)}</div>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(entry)} className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 transition hover:bg-blue-50 hover:text-blue-600" aria-label={`Edit ${entry.title}`}>
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(entry.id)} className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${entry.title}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

    </FinanceShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-gray-500">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
