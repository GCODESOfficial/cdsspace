'use client';

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Download, Trash2, Banknote, ListOrdered, UserPlus } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import StatCard from "@/components/finance/StatCard";
import ModalHeader from "@/components/finance/ModalHeader";
import BankPicker from "@/components/finance/BankPicker";
import { findBankByCode } from "@/lib/finance/banks";
import { FinanceEmployee, FinancePayrollRun, FinancePayrollItem, formatMoney } from "@/lib/finance/types";
import { convertFinanceAmount } from "@/lib/finance/currency-display";
import { useFinanceDisplayCurrency } from "@/components/finance/FinanceCurrencySelector";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

export default function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { currency: displayCurrency, rates } = useFinanceDisplayCurrency();
  const { id } = use(params);
  const [run, setRun] = useState<FinancePayrollRun | null>(null);
  const [items, setItems] = useState<FinancePayrollItem[]>([]);
  const [employees, setEmployees] = useState<FinanceEmployee[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", account_number: "", amount: "", bank_code: "", bank_name: "", narration: "" });

  const load = async () => {
    const [r, e] = await Promise.all([
      fetch(`/api/admin/finance/payroll/runs/${id}`).then((r) => r.json()),
      fetch("/api/admin/finance/payroll/employees").then((r) => r.json()),
    ]);
    setRun(r.run); setItems(r.items ?? []); setEmployees(e.employees ?? []);
  };
  useEffect(() => { load(); }, [id]);

  const pickEmployee = (eid: string) => {
    if (eid === "_manual") { setForm({ ...form, employee_id: "" }); return; }
    const e = employees.find((x) => x.id === eid);
    if (!e) return;
    setForm({
      employee_id: e.id,
      account_number: e.account_number ?? "",
      amount: e.base_salary ? String(e.base_salary) : "",
      bank_code: e.bank_code ?? "",
      bank_name: e.bank_code ? findBankByCode(e.bank_code)?.name ?? "" : "",
      narration: `Salary - ${e.name}`,
    });
  };

  const save = async () => {
    if (!form.account_number || !form.amount || !form.bank_code || !form.narration) { appAlert("All fields required"); return; }
    const r = await fetch(`/api/admin/finance/payroll/runs/${id}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, employee_id: form.employee_id || null, amount: Number(form.amount) }) });
    if (r.ok) { setOpen(false); setForm({ employee_id: "", account_number: "", amount: "", bank_code: "", bank_name: "", narration: "" }); load(); }
  };

  const remove = async (iid: string) => {
    if (!(await appConfirm("Remove item?"))) return;
    await fetch(`/api/admin/finance/payroll/items/${iid}`, { method: "DELETE" }); load();
  };

  const updateStatus = async (status: string) => {
    await fetch(`/api/admin/finance/payroll/runs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  };

  const removeRun = async () => {
    if (!(await appConfirm("Delete this entire payroll run?"))) return;
    const r = await fetch(`/api/admin/finance/payroll/runs/${id}`, { method: "DELETE" });
    if (r.ok) window.location.href = "/admin/finance/payroll";
  };

  if (!run) return <FinanceShell title="Loading…"><div className={`${glassCard} p-10 text-gray-500`}>Loading…</div></FinanceShell>;

  return (
    <FinanceShell
      title={run.title}
      subtitle={`Period: ${run.period}`}
      back={{ href: "/admin/finance/payroll", label: "Payroll" }}
      actions={
        <>
          <Select value={run.status} onValueChange={updateStatus}>
            <SelectTrigger className="h-11 w-36 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <a href={`/api/admin/finance/payroll/runs/${id}/export`}>
            <Button variant="outline" className="h-11 px-4 rounded-xl"><Download className="w-4 h-4 mr-1.5" /> Export CSV</Button>
          </a>
          <Button variant="outline" className="h-11 px-4 rounded-xl text-red-600 border-red-200 hover:bg-red-50" onClick={removeRun}>Delete</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 px-5 rounded-xl bg-[#0A4FE8] shadow-lg shadow-blue-600/30"><Plus className="w-4 h-4 mr-1.5" /> Add Item</Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-md rounded-2xl border-0 shadow-2xl p-7">
              <ModalHeader icon={UserPlus} title="Add Payroll Item" subtitle="Pull from employee or enter manually" accent="bg-[#0A4FE8]" />
              <div className="space-y-4 mt-2">
                <Field label="Employee (optional)">
                  <Select value={form.employee_id || "_manual"} onValueChange={pickEmployee}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select or enter manually" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_manual">Manual entry</SelectItem>
                      {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Account Number"><Input className="h-11 rounded-xl" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></Field>
                <Field label="Amount"><Input type="number" className="h-11 rounded-xl" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
                <Field label="Bank">
                  <BankPicker value={form.bank_code} onChange={(code, name) => setForm({ ...form, bank_code: code, bank_name: name })} />
                </Field>
                <Field label="Narration"><Input className="h-11 rounded-xl" value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} placeholder="e.g. Salary - John Doe Oct" /></Field>
              </div>
              <DialogFooter className="mt-5">
                <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} className="rounded-xl bg-[#0A4FE8]">Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        <StatCard icon={Banknote} label="Total Amount" value={formatMoney(convertFinanceAmount(run.total, run.currency, displayCurrency, rates), displayCurrency)} sub={run.currency !== displayCurrency ? `Original: ${formatMoney(run.total, run.currency)}` : undefined} accent="bg-[#0A4FE8]" />
        <StatCard icon={ListOrdered} label="Items" value={String(items.length)} accent="bg-[#0A4FE8]" />
      </div>

      {items.length === 0 ? (
        <div className={`${glassCard} p-12 text-center text-gray-500`}>No items yet - add an item to get started.</div>
      ) : (
        <div className={`${glassCard} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="bg-white/50">
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-5 py-4">Account Number</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4">Bank</th>
                <th className="px-5 py-4">Narration</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-white/60 hover:bg-white/50">
                  <td className="px-5 py-4 font-mono text-gray-900">{it.account_number}</td>
                  <td className="px-5 py-4 font-semibold">
                    <div>{formatMoney(convertFinanceAmount(it.amount, run.currency, displayCurrency, rates), displayCurrency)}</div>
                    {run.currency !== displayCurrency && <div className="mt-0.5 text-[11px] font-normal text-gray-400">Original: {formatMoney(it.amount, run.currency)}</div>}
                  </td>
                  <td className="px-5 py-4 text-gray-500">{findBankByCode(it.bank_code)?.name ?? it.bank_code} <span className="text-xs text-gray-400">({it.bank_code})</span></td>
                  <td className="px-5 py-4 text-gray-500">{it.narration}</td>
                  <td className="px-5 py-4 text-right">
                    <button onClick={() => remove(it.id)} className="w-8 h-8 rounded-lg hover:bg-red-50 grid place-items-center text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
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
