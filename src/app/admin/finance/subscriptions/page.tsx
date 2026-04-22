'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Repeat, Trash2, Edit2, Power, CalendarClock, TrendingUp } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import StatCard from "@/components/finance/StatCard";
import ModalHeader from "@/components/finance/ModalHeader";
import { CURRENCIES, Currency, formatMoney } from "@/lib/finance/types";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface Sub {
  id: string; project_id: string | null; name: string; category: string | null;
  amount: number; currency: Currency; billing_cycle: "monthly" | "quarterly" | "yearly";
  next_due_date: string | null; active: boolean; notes: string | null;
  finance_projects?: { name: string; client: string } | null;
}

const EMPTY: { project_id: string; name: string; category: string; amount: string; currency: Currency; billing_cycle: "monthly" | "quarterly" | "yearly"; next_due_date: string; notes: string } = { project_id: "", name: "", category: "", amount: "", currency: "NGN", billing_cycle: "monthly", next_due_date: "", notes: "" };

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; client: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Sub | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);

  const load = async () => {
    setLoading(true);
    const [s, p] = await Promise.all([
      fetch("/api/admin/finance/subscriptions").then((r) => r.json()),
      fetch("/api/admin/finance/projects").then((r) => r.json()),
    ]);
    setSubs(s.subscriptions ?? []); setProjects(p.projects ?? []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (s: Sub) => {
    setEditing(s);
    setForm({
      project_id: s.project_id ?? "", name: s.name, category: s.category ?? "",
      amount: String(s.amount), currency: s.currency, billing_cycle: s.billing_cycle,
      next_due_date: s.next_due_date ?? "", notes: s.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    const payload = { ...form, project_id: form.project_id || null, amount: Number(form.amount) };
    const url = editing ? `/api/admin/finance/subscriptions/${editing.id}` : "/api/admin/finance/subscriptions";
    const method = editing ? "PATCH" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) { setOpen(false); load(); } else appAlert("Failed");
  };

  const toggle = async (s: Sub) => {
    await fetch(`/api/admin/finance/subscriptions/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !s.active }) });
    load();
  };
  const remove = async (id: string) => {
    if (!(await appConfirm("Delete this subscription?"))) return;
    await fetch(`/api/admin/finance/subscriptions/${id}`, { method: "DELETE" });
    load();
  };

  const monthly = subs.filter((s) => s.active).reduce((sum, s) => {
    const a = Number(s.amount);
    return sum + (s.billing_cycle === "monthly" ? a : s.billing_cycle === "quarterly" ? a / 3 : a / 12);
  }, 0);

  return (
    <FinanceShell
      title="Subscriptions"
      subtitle="Recurring tools, servers, software & services."
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
              <Plus className="w-4 h-4 mr-1.5" /> New Subscription
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white max-w-xl rounded-2xl border-0 shadow-2xl p-7">
            <ModalHeader icon={Repeat} title={editing ? "Edit Subscription" : "Add Subscription"} subtitle="Recurring tools, servers and software" accent="from-amber-500 to-orange-500" />
            <div className="space-y-4 mt-2">
              <Field label="Name"><Input className="h-11 rounded-xl" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Figma, Vercel, Adobe CC" /></Field>
              <Field label="Category"><Input className="h-11 rounded-xl" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Design, Hosting, Dev tools…" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount"><Input type="number" className="h-11 rounded-xl" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
                <Field label="Currency">
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Billing Cycle">
                  <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v as typeof form.billing_cycle })}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Next Due"><Input type="date" className="h-11 rounded-xl" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} /></Field>
              </div>
              <Field label="Project (optional)">
                <Select value={form.project_id || "_none"} onValueChange={(v) => setForm({ ...form, project_id: v === "_none" ? "" : v })}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="No project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No project</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.client}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Notes"><Textarea className="rounded-xl" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
            <DialogFooter className="mt-5">
              <Button variant="outline" className="h-11 px-5 rounded-xl" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatCard icon={Repeat} label="Active Subscriptions" value={String(subs.filter((s) => s.active).length)} accent="from-amber-500 to-orange-500" />
        <StatCard icon={CalendarClock} label="Monthly Cost" value={formatMoney(monthly)} accent="from-blue-500 to-indigo-500" />
        <StatCard icon={TrendingUp} label="Annual Run-Rate" value={formatMoney(monthly * 12)} accent="from-fuchsia-500 to-pink-500" />
      </div>

      {loading ? (
        <div className={`${glassCard} p-10 text-center text-gray-500`}>Loading…</div>
      ) : subs.length === 0 ? (
        <div className={`${glassCard} p-14 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-amber-50 grid place-items-center mx-auto mb-4">
            <Repeat className="w-7 h-7 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No subscriptions yet</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {subs.map((s) => (
            <div key={s.id} className={`${glassCard} p-5 ${!s.active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{s.name}</h3>
                  {s.category && <p className="text-xs text-gray-500">{s.category}</p>}
                </div>
                <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${s.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{s.active ? "active" : "paused"}</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{formatMoney(s.amount, s.currency)}</div>
              <div className="text-xs text-gray-500">/ {s.billing_cycle}</div>
              {s.finance_projects && <div className="text-xs text-blue-600 mt-2">{s.finance_projects.name}</div>}
              {s.next_due_date && <div className="text-xs text-gray-500 mt-1">Next: {new Date(s.next_due_date).toLocaleDateString()}</div>}
              <div className="flex justify-end gap-1 mt-3">
                <button onClick={() => toggle(s)} className="w-8 h-8 rounded-lg hover:bg-amber-50 grid place-items-center text-gray-500 hover:text-amber-600"><Power className="w-4 h-4" /></button>
                <button onClick={() => openEdit(s)} className="w-8 h-8 rounded-lg hover:bg-blue-50 grid place-items-center text-gray-500 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => remove(s.id)} className="w-8 h-8 rounded-lg hover:bg-red-50 grid place-items-center text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </FinanceShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs uppercase tracking-wide text-gray-500">{label}</Label><div className="mt-1.5">{children}</div></div>;
}
