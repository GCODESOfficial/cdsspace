'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Wallet, Users, Trash2, CalendarRange, UserPlus } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import ModalHeader from "@/components/finance/ModalHeader";
import BankPicker from "@/components/finance/BankPicker";
import { findBankByCode } from "@/lib/finance/banks";
import { FinanceEmployee, FinancePayrollRun, formatMoney } from "@/lib/finance/types";

export default function PayrollPage() {
  const [tab, setTab] = useState<"runs" | "employees">("runs");
  const [employees, setEmployees] = useState<FinanceEmployee[]>([]);
  const [runs, setRuns] = useState<FinancePayrollRun[]>([]);
  const [empOpen, setEmpOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [empForm, setEmpForm] = useState({ name: "", role: "", email: "", phone: "", bank_code: "", bank_name: "", account_number: "", account_name: "", base_salary: "" });
  const [runForm, setRunForm] = useState({ title: "", period: new Date().toISOString().slice(0, 7) });

  const load = async () => {
    const [e, r] = await Promise.all([
      fetch("/api/admin/finance/payroll/employees").then((r) => r.json()),
      fetch("/api/admin/finance/payroll/runs").then((r) => r.json()),
    ]);
    setEmployees(e.employees ?? []); setRuns(r.runs ?? []);
  };
  useEffect(() => { load(); }, []);

  const saveEmp = async () => {
    if (!empForm.name) return;
    const r = await fetch("/api/admin/finance/payroll/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...empForm, base_salary: empForm.base_salary ? Number(empForm.base_salary) : null }) });
    if (r.ok) { setEmpOpen(false); setEmpForm({ name: "", role: "", email: "", phone: "", bank_code: "", bank_name: "", account_number: "", account_name: "", base_salary: "" }); load(); }
  };
  const removeEmp = async (id: string) => {
    if (!confirm("Delete employee?")) return;
    await fetch(`/api/admin/finance/payroll/employees/${id}`, { method: "DELETE" }); load();
  };
  const saveRun = async () => {
    if (!runForm.title || !runForm.period) return;
    const r = await fetch("/api/admin/finance/payroll/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(runForm) });
    if (r.ok) { setRunOpen(false); setRunForm({ title: "", period: new Date().toISOString().slice(0, 7) }); load(); }
  };

  return (
    <FinanceShell
      title="Payroll"
      subtitle="Employees, runs & bank export."
      actions={
        tab === "runs" ? (
          <Dialog open={runOpen} onOpenChange={setRunOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30"><Plus className="w-4 h-4 mr-1.5" /> New Run</Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-md rounded-2xl border-0 shadow-2xl p-7">
              <ModalHeader icon={CalendarRange} title="New Payroll Run" subtitle="Create a payroll batch for a period" accent="from-cyan-500 to-sky-500" />
              <div className="space-y-4 mt-2">
                <Field label="Title"><Input className="h-11 rounded-xl" value={runForm.title} onChange={(e) => setRunForm({ ...runForm, title: e.target.value })} placeholder="e.g. October 2026 Salary" /></Field>
                <Field label="Period"><Input type="month" className="h-11 rounded-xl" value={runForm.period} onChange={(e) => setRunForm({ ...runForm, period: e.target.value })} /></Field>
              </div>
              <DialogFooter className="mt-5">
                <Button variant="outline" className="rounded-xl" onClick={() => setRunOpen(false)}>Cancel</Button>
                <Button onClick={saveRun} className="rounded-xl bg-gradient-to-b from-blue-600 to-blue-700">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Dialog open={empOpen} onOpenChange={setEmpOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30"><Plus className="w-4 h-4 mr-1.5" /> New Employee</Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-xl rounded-2xl border-0 shadow-2xl p-7">
              <ModalHeader icon={UserPlus} title="New Employee" subtitle="Add a salaried staff member" accent="from-cyan-500 to-sky-500" />
              <div className="grid grid-cols-2 gap-4 mt-2">
                <Field label="Full Name"><Input className="h-11 rounded-xl" value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} /></Field>
                <Field label="Role"><Input className="h-11 rounded-xl" value={empForm.role} onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })} /></Field>
                <Field label="Email"><Input className="h-11 rounded-xl" value={empForm.email} onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} /></Field>
                <Field label="Phone"><Input className="h-11 rounded-xl" value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} /></Field>
                <Field label="Bank">
                  <BankPicker value={empForm.bank_code} onChange={(code, name) => setEmpForm({ ...empForm, bank_code: code, bank_name: name })} />
                </Field>
                <Field label="Account Number"><Input className="h-11 rounded-xl" value={empForm.account_number} onChange={(e) => setEmpForm({ ...empForm, account_number: e.target.value })} /></Field>
                <Field label="Account Name"><Input className="h-11 rounded-xl" value={empForm.account_name} onChange={(e) => setEmpForm({ ...empForm, account_name: e.target.value })} /></Field>
                <Field label="Base Salary"><Input type="number" className="h-11 rounded-xl" value={empForm.base_salary} onChange={(e) => setEmpForm({ ...empForm, base_salary: e.target.value })} /></Field>
              </div>
              <DialogFooter className="mt-5">
                <Button variant="outline" className="rounded-xl" onClick={() => setEmpOpen(false)}>Cancel</Button>
                <Button onClick={saveEmp} className="rounded-xl bg-gradient-to-b from-blue-600 to-blue-700">Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      }
    >
      <div className={`${glassCard} p-1.5 inline-flex rounded-2xl mb-6`}>
        <button onClick={() => setTab("runs")} className={`px-5 py-2 rounded-xl text-sm font-medium ${tab === "runs" ? "bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30" : "text-gray-600"}`}>Payroll Runs</button>
        <button onClick={() => setTab("employees")} className={`px-5 py-2 rounded-xl text-sm font-medium ${tab === "employees" ? "bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30" : "text-gray-600"}`}>Employees</button>
      </div>

      {tab === "runs" ? (
        runs.length === 0 ? (
          <div className={`${glassCard} p-14 text-center`}>
            <div className="w-14 h-14 rounded-2xl bg-cyan-50 grid place-items-center mx-auto mb-4"><Wallet className="w-7 h-7 text-cyan-600" /></div>
            <h3 className="text-lg font-semibold text-gray-900">No payroll runs yet</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {runs.map((r) => (
              <Link key={r.id} href={`/admin/finance/payroll/${r.id}`}>
                <div className={`${glassCard} p-5 hover:-translate-y-0.5 transition`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{r.title}</h3>
                      <p className="text-xs text-gray-500">{r.period}</p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${r.status === "paid" ? "bg-emerald-50 text-emerald-700" : r.status === "processed" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{r.status}</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{formatMoney(r.total, r.currency)}</div>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : (
        employees.length === 0 ? (
          <div className={`${glassCard} p-14 text-center`}>
            <div className="w-14 h-14 rounded-2xl bg-cyan-50 grid place-items-center mx-auto mb-4"><Users className="w-7 h-7 text-cyan-600" /></div>
            <h3 className="text-lg font-semibold text-gray-900">No employees yet</h3>
          </div>
        ) : (
          <div className={`${glassCard} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead className="bg-white/50">
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-4">Name</th>
                  <th className="px-5 py-4">Role</th>
                  <th className="px-5 py-4">Bank</th>
                  <th className="px-5 py-4">Account</th>
                  <th className="px-5 py-4">Salary</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-t border-white/60 hover:bg-white/50">
                    <td className="px-5 py-4 font-medium text-gray-900">{e.name}</td>
                    <td className="px-5 py-4 text-gray-500">{e.role ?? "—"}</td>
                    <td className="px-5 py-4 text-gray-500">{e.bank_code ? findBankByCode(e.bank_code)?.name : "—"}</td>
                    <td className="px-5 py-4 text-gray-500 font-mono">{e.account_number ?? "—"}</td>
                    <td className="px-5 py-4 font-semibold">{e.base_salary ? formatMoney(e.base_salary, e.currency) : "—"}</td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => removeEmp(e.id)} className="w-8 h-8 rounded-lg hover:bg-red-50 grid place-items-center text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </FinanceShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs uppercase tracking-wide text-gray-500">{label}</Label><div className="mt-1.5">{children}</div></div>;
}
