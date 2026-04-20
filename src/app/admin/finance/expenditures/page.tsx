'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Receipt, Trash2, Repeat, Zap } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import StatCard from "@/components/finance/StatCard";
import ModalHeader from "@/components/finance/ModalHeader";
import { CURRENCIES, Currency, FinanceExpenditure, formatMoney } from "@/lib/finance/types";

type Cycle = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

const EMPTY: {
  title: string; category: string; amount: string; currency: Currency;
  spent_on: string; recurring: boolean; recurrence_cycle: Cycle;
  custom_interval_days: string; next_due_date: string; notes: string;
} = {
  title: "", category: "", amount: "", currency: "NGN",
  spent_on: new Date().toISOString().slice(0, 10),
  recurring: false, recurrence_cycle: "monthly",
  custom_interval_days: "", next_due_date: "", notes: "",
};

export default function ExpendituresPage() {
  const [list, setList] = useState<FinanceExpenditure[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/admin/finance/expenditures");
    const d = await r.json();
    setList(d.expenditures ?? []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title || !form.amount) return;
    const r = await fetch("/api/admin/finance/expenditures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
    if (r.ok) { setOpen(false); setForm(EMPTY); load(); }
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this expenditure?")) return;
    await fetch(`/api/admin/finance/expenditures/${id}`, { method: "DELETE" }); load();
  };

  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  const recurring = list.filter((e) => e.recurring).reduce((s, e) => s + Number(e.amount), 0);
  const oneOff = total - recurring;

  return (
    <FinanceShell
      title="Expenditures"
      subtitle="Track every outgoing spend, one-time or recurring."
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
              <Plus className="w-4 h-4 mr-1.5" /> New Expenditure
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white max-w-xl rounded-2xl border-0 shadow-2xl p-7">
            <ModalHeader icon={Receipt} title="New Expenditure" subtitle="Track outgoing spend, one-time or recurring" accent="from-rose-500 to-red-500" />
            <div className="space-y-4 mt-2">
              <Field label="Title"><Input className="h-11 rounded-xl" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Category"><Input className="h-11 rounded-xl" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Office, Travel…" /></Field>
                <Field label="Date"><Input type="date" className="h-11 rounded-xl" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount"><Input type="number" className="h-11 rounded-xl" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
                <Field label="Currency">
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-blue-900">Recurring expense</Label>
                  <Switch checked={form.recurring} onCheckedChange={(v) => setForm({ ...form, recurring: v })} className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-blue-200" />
                </div>
                {form.recurring && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Cycle">
                        <Select value={form.recurrence_cycle} onValueChange={(v) => setForm({ ...form, recurrence_cycle: v as Cycle })}>
                          <SelectTrigger className="h-11 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent position="popper" sideOffset={4} className="z-[100] bg-white">
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="yearly">Yearly</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Next Due"><Input type="date" className="h-11 rounded-xl bg-white" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} /></Field>
                    </div>
                    {form.recurrence_cycle === "custom" && (
                      <Field label="Repeat every (days)">
                        <Input
                          type="number"
                          min="1"
                          className="h-11 rounded-xl bg-white"
                          placeholder="e.g. 10"
                          value={form.custom_interval_days}
                          onChange={(e) => setForm({ ...form, custom_interval_days: e.target.value })}
                        />
                      </Field>
                    )}
                  </>
                )}
              </div>
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
        <StatCard icon={Receipt} label="Total Spend" value={formatMoney(total)} accent="from-rose-500 to-red-500" />
        <StatCard icon={Repeat} label="Recurring" value={formatMoney(recurring)} accent="from-amber-500 to-orange-500" />
        <StatCard icon={Zap} label="One-Off" value={formatMoney(oneOff)} accent="from-blue-500 to-indigo-500" />
      </div>

      {loading ? (
        <div className={`${glassCard} p-10 text-center text-gray-500`}>Loading…</div>
      ) : list.length === 0 ? (
        <div className={`${glassCard} p-14 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-rose-50 grid place-items-center mx-auto mb-4">
            <Receipt className="w-7 h-7 text-rose-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No expenditures yet</h3>
        </div>
      ) : (
        <div className={`${glassCard} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="bg-white/50">
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-5 py-4">Title</th>
                <th className="px-5 py-4">Category</th>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-t border-white/60 hover:bg-white/50">
                  <td className="px-5 py-4 font-medium text-gray-900">{e.title}</td>
                  <td className="px-5 py-4 text-gray-500">{e.category ?? "—"}</td>
                  <td className="px-5 py-4 text-gray-500">{new Date(e.spent_on).toLocaleDateString()}</td>
                  <td className="px-5 py-4 font-semibold">{formatMoney(e.amount, e.currency)}</td>
                  <td className="px-5 py-4">
                    {e.recurring ? <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">{e.recurrence_cycle}</span> : <span className="text-xs text-gray-400">one-off</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button onClick={() => remove(e.id)} className="w-8 h-8 rounded-lg hover:bg-red-50 grid place-items-center text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FinanceShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs uppercase tracking-wide text-gray-500">{label}</Label><div className="mt-1.5">{children}</div></div>;
}
