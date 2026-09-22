'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { CalendarRange, ChevronLeft, Loader2, PencilLine, Plus, ShieldCheck, Trash2, UserPlus, Users, Wallet } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import ModalHeader from "@/components/finance/ModalHeader";
import BankPicker from "@/components/finance/BankPicker";
import { findBankByCode } from "@/lib/finance/banks";
import { CURRENCIES, CURRENCY_NAMES, FinanceEmployee, FinancePayrollRun, formatMoney, type Currency } from "@/lib/finance/types";
import { convertFinanceAmount } from "@/lib/finance/currency-display";
import { useFinanceDisplayCurrency } from "@/components/finance/FinanceCurrencySelector";
import { appAlert, appConfirm } from "@/lib/app-notify";

export default function PayrollPage() {
  const { currency: displayCurrency, rates } = useFinanceDisplayCurrency();
  const [tab, setTab] = useState<"runs" | "employees">("runs");
  const [employees, setEmployees] = useState<FinanceEmployee[]>([]);
  const [runs, setRuns] = useState<FinancePayrollRun[]>([]);
  const [empOpen, setEmpOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<FinanceEmployee | null>(null);
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
    if (!(await appConfirm("Delete employee?"))) return;
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
              <Button className="h-11 px-5 rounded-xl bg-[#0A4FE8] shadow-lg shadow-blue-600/30"><Plus className="w-4 h-4 mr-1.5" /> New run</Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-md rounded-2xl border-0 shadow-2xl p-7">
              <ModalHeader icon={CalendarRange} title="New payroll run" subtitle="Create a payroll batch for a period" accent="bg-[#0A4FE8]" />
              <div className="space-y-4 mt-2">
                <Field label="Title"><Input className="h-11 rounded-xl" value={runForm.title} onChange={(e) => setRunForm({ ...runForm, title: e.target.value })} placeholder="e.g. October 2026 Salary" /></Field>
                <Field label="Period"><Input type="month" className="h-11 rounded-xl" value={runForm.period} onChange={(e) => setRunForm({ ...runForm, period: e.target.value })} /></Field>
              </div>
              <DialogFooter className="mt-5">
                <Button variant="outline" className="rounded-xl" onClick={() => setRunOpen(false)}>Cancel</Button>
                <Button onClick={saveRun} className="rounded-xl bg-[#0A4FE8]">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Dialog open={empOpen} onOpenChange={setEmpOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 px-5 rounded-xl bg-[#0A4FE8] shadow-lg shadow-blue-600/30"><Plus className="w-4 h-4 mr-1.5" /> New employee</Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-xl rounded-2xl border-0 shadow-2xl p-7">
              <ModalHeader icon={UserPlus} title="New employee" subtitle="Add a salaried staff member" accent="bg-[#0A4FE8]" />
              <div className="grid grid-cols-1 gap-4 mt-2 sm:grid-cols-2">
                <Field label="Full name"><Input className="h-11 rounded-xl" value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} /></Field>
                <Field label="Role"><Input className="h-11 rounded-xl" value={empForm.role} onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })} /></Field>
                <Field label="Email"><Input className="h-11 rounded-xl" value={empForm.email} onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} /></Field>
                <Field label="Phone"><Input className="h-11 rounded-xl" value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} /></Field>
                <Field label="Bank">
                  <BankPicker value={empForm.bank_code} onChange={(code, name) => setEmpForm({ ...empForm, bank_code: code, bank_name: name })} />
                </Field>
                <Field label="Account number"><Input className="h-11 rounded-xl" value={empForm.account_number} onChange={(e) => setEmpForm({ ...empForm, account_number: e.target.value })} /></Field>
                <Field label="Account name"><Input className="h-11 rounded-xl" value={empForm.account_name} onChange={(e) => setEmpForm({ ...empForm, account_name: e.target.value })} /></Field>
                <Field label="Base salary"><Input type="number" className="h-11 rounded-xl" value={empForm.base_salary} onChange={(e) => setEmpForm({ ...empForm, base_salary: e.target.value })} /></Field>
              </div>
              <DialogFooter className="mt-5">
                <Button variant="outline" className="rounded-xl" onClick={() => setEmpOpen(false)}>Cancel</Button>
                <Button onClick={saveEmp} className="rounded-xl bg-[#0A4FE8]">Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      }
    >
      <div className={`${glassCard} p-1.5 inline-flex rounded-2xl mb-6`}>
        <button onClick={() => setTab("runs")} className={`px-5 py-2 rounded-xl text-sm font-medium ${tab === "runs" ? "bg-[#0A4FE8] text-white shadow-lg shadow-blue-600/30" : "text-gray-600"}`}>Payroll runs</button>
        <button onClick={() => setTab("employees")} className={`px-5 py-2 rounded-xl text-sm font-medium ${tab === "employees" ? "bg-[#0A4FE8] text-white shadow-lg shadow-blue-600/30" : "text-gray-600"}`}>Employees</button>
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
                  <div className="text-2xl font-bold text-gray-900">{formatMoney(convertFinanceAmount(r.total, r.currency, displayCurrency, rates), displayCurrency)}</div>
                  {r.currency !== displayCurrency && <div className="mt-0.5 text-[11px] text-gray-400">Original: {formatMoney(r.total, r.currency)}</div>}
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
          <div className={`${glassCard} overflow-x-auto`}>
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-white/50">
                <tr className="text-left text-[11px] font-medium text-gray-500">
                  <th className="px-5 py-4">Name</th>
                  <th className="px-5 py-4">Role</th>
                  <th className="px-5 py-4">Bank</th>
                  <th className="px-5 py-4">Account</th>
                  <th className="px-5 py-4">Salary</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-t border-white/60 hover:bg-white/50">
                    <td className="px-5 py-4 font-medium text-gray-900">{e.name}</td>
                    <td className="px-5 py-4 text-gray-500">{e.role ?? "-"}</td>
                    <td className="px-5 py-4 text-gray-500">{e.bank_code ? findBankByCode(e.bank_code)?.name : "-"}</td>
                    <td className="px-5 py-4 text-gray-500 font-mono">{e.account_number ?? "-"}</td>
                    <td className="px-5 py-4 font-semibold">
                      {e.base_salary != null ? <>
                        <div>{formatMoney(convertFinanceAmount(e.base_salary, e.currency, displayCurrency, rates), displayCurrency)}</div>
                        {e.currency !== displayCurrency && <div className="mt-0.5 text-[11px] font-normal text-gray-400">Original: {formatMoney(e.base_salary, e.currency)}</div>}
                      </> : "-"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingEmployee(e)}
                          className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 transition hover:bg-blue-50 hover:text-[#0A4FE8]"
                          aria-label={`Edit payroll details for ${e.name}`}
                          title="Edit payroll details"
                        >
                          <PencilLine className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeEmp(e.id)}
                          className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${e.name}`}
                          title="Delete employee"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {editingEmployee && (
        <EditEmployeeDialog
          key={editingEmployee.id}
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSaved={() => {
            setEditingEmployee(null);
            void load();
          }}
        />
      )}
    </FinanceShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs font-medium text-gray-600">{label}</Label><div className="mt-1.5">{children}</div></div>;
}

type EmployeeEditForm = {
  name: string;
  role: string;
  email: string;
  phone: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  base_salary: string;
  currency: Currency;
  edit_reason: string;
  approval_date: string;
};

type EmployeeEditStep = "approval" | "details";
type DraftState = "loading" | "idle" | "saving" | "saved" | "error";

function employeeEditForm(employee: FinanceEmployee): EmployeeEditForm {
  return {
    name: employee.name,
    role: employee.role ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    bank_code: employee.bank_code ?? "",
    bank_name: employee.bank_name ?? "",
    account_number: employee.account_number ?? "",
    account_name: employee.account_name ?? "",
    base_salary: employee.base_salary == null ? "" : String(employee.base_salary),
    currency: employee.currency,
    edit_reason: "",
    approval_date: "",
  };
}

function restoreEmployeeEditDraft(
  payload: unknown,
  fallback: EmployeeEditForm,
): { form: EmployeeEditForm; step: EmployeeEditStep } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (!record.form || typeof record.form !== "object" || Array.isArray(record.form)) return null;
  const saved = record.form as Record<string, unknown>;
  const form = { ...fallback };
  for (const key of Object.keys(form) as Array<keyof EmployeeEditForm>) {
    const value = saved[key];
    if (typeof value === "string") {
      if (key === "currency") {
        if (CURRENCIES.includes(value as Currency)) form.currency = value as Currency;
      } else {
        form[key] = value;
      }
    }
  }
  const hasApproval = Boolean(form.edit_reason.trim() && form.approval_date);
  return {
    form,
    step: record.step === "details" && hasApproval ? "details" : "approval",
  };
}

function EditEmployeeDialog({
  employee,
  onClose,
  onSaved,
}: {
  employee: FinanceEmployee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialForm = employeeEditForm(employee);
  const [form, setForm] = useState<EmployeeEditForm>(initialForm);
  const [step, setStep] = useState<EmployeeEditStep>("approval");
  const [draftState, setDraftState] = useState<DraftState>("loading");
  const [draftRestored, setDraftRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hydrated = useRef(false);
  const interacted = useRef(false);
  const submitting = useRef(false);
  const pendingDraftSave = useRef<Promise<void> | null>(null);

  const draftUrl = `/api/admin/finance/payroll/employees/${employee.id}/draft`;

  const persistDraft = useCallback((
    nextForm: EmployeeEditForm,
    nextStep: EmployeeEditStep,
    keepalive = false,
  ) => {
    const previous = pendingDraftSave.current?.catch(() => undefined) ?? Promise.resolve();
    const request = previous.then(async () => {
      const response = await fetch(draftUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: { form: nextForm, step: nextStep } }),
        keepalive,
      });
      if (!response.ok) throw new Error("Draft save failed");
    });
    pendingDraftSave.current = request;
    return request;
  }, [draftUrl]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(draftUrl, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Draft load failed");
        const restored = restoreEmployeeEditDraft(data.draft?.payload, initialForm);
        if (!cancelled && restored && !interacted.current) {
          setForm(restored.form);
          setStep(restored.step);
          setDraftRestored(true);
        }
        if (!cancelled) setDraftState("idle");
      } catch {
        if (!cancelled) setDraftState("error");
      } finally {
        if (!cancelled) hydrated.current = true;
      }
    })();
    return () => { cancelled = true; };
    // The dialog is keyed by employee id, so this hydration runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftUrl]);

  useEffect(() => {
    if (!hydrated.current || !interacted.current) return;
    setDraftState("saving");
    const timer = window.setTimeout(() => {
      if (submitting.current) return;
      void persistDraft(form, step)
        .then(() => setDraftState("saved"))
        .catch(() => setDraftState("error"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [form, persistDraft, step]);

  useEffect(() => {
    const saveBeforeLeaving = () => {
      if (hydrated.current && interacted.current) void persistDraft(form, step, true);
    };
    window.addEventListener("pagehide", saveBeforeLeaving);
    return () => window.removeEventListener("pagehide", saveBeforeLeaving);
  }, [form, persistDraft, step]);

  const change = <K extends keyof EmployeeEditForm>(key: K, value: EmployeeEditForm[K]) => {
    interacted.current = true;
    setDraftRestored(false);
    setError("");
    setForm((current) => ({ ...current, [key]: value }));
  };

  const close = () => {
    if (hydrated.current && interacted.current) void persistDraft(form, step, true);
    onClose();
  };

  const continueToDetails = () => {
    if (!form.edit_reason.trim()) {
      setError("Enter the reason this payroll edit was approved.");
      return;
    }
    if (!form.approval_date) {
      setError("Enter the date this payroll edit was approved.");
      return;
    }
    interacted.current = true;
    setError("");
    setStep("details");
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError("Employee name is required.");
      return;
    }
    if (form.base_salary && (!Number.isFinite(Number(form.base_salary)) || Number(form.base_salary) < 0)) {
      setError("Enter a valid salary amount.");
      return;
    }

    setSaving(true);
    submitting.current = true;
    setError("");
    try {
      await pendingDraftSave.current?.catch(() => undefined);
      const response = await fetch(`/api/admin/finance/payroll/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          role: form.role,
          email: form.email,
          phone: form.phone,
          bank_code: form.bank_code,
          bank_name: form.bank_name,
          account_number: form.account_number,
          account_name: form.account_name,
          base_salary: form.base_salary === "" ? null : Number(form.base_salary),
          currency: form.currency,
          edit_reason: form.edit_reason,
          approval_date: form.approval_date,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Couldn't update the employee payroll details.");
        return;
      }
      onSaved();
    } catch {
      setError("Couldn't update the employee payroll details. Try again.");
      await appAlert("Couldn't update the employee payroll details. Try again.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const draftLabel = draftState === "loading"
    ? "Checking for a saved draft…"
    : draftState === "saving"
      ? "Saving draft…"
      : draftState === "saved"
        ? "Draft saved"
        : draftState === "error"
          ? "Draft could not be saved"
          : draftRestored
            ? "Saved draft restored"
            : "Your progress is saved automatically";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-w-2xl rounded-2xl border-0 bg-white p-5 shadow-2xl sm:p-7">
        {step === "approval" ? (
          <>
            <ModalHeader
              icon={ShieldCheck}
              title="Approve payroll edit"
              subtitle={`Record the approval before changing ${employee.name}'s payroll details`}
              accent="bg-[#0A4FE8]"
            />
            <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-slate-600">
              The reason and approval date will be retained in the payroll audit history with the administrator who makes the change.
            </div>
            <div className="mt-5 space-y-4">
              <Field label="Reason for edit">
                <Textarea
                  value={form.edit_reason}
                  onChange={(event) => change("edit_reason", event.target.value)}
                  maxLength={1000}
                  placeholder="Explain why these payroll details need to change"
                  className="min-h-28"
                  autoFocus
                  disabled={draftState === "loading"}
                />
              </Field>
              <Field label="Date approved">
                <Input
                  type="date"
                  value={form.approval_date}
                  onChange={(event) => change("approval_date", event.target.value)}
                  className="h-11 rounded-xl"
                  disabled={draftState === "loading"}
                />
              </Field>
            </div>
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className={`text-xs ${draftState === "error" ? "text-red-600" : "text-slate-400"}`}>{draftLabel}</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={close}>Close</Button>
                <Button onClick={continueToDetails} disabled={draftState === "loading"} className="bg-[#0A4FE8] hover:bg-[#083EC0]">
                  Continue to details
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <ModalHeader
              icon={PencilLine}
              title={`Edit payroll details - ${employee.name}`}
              subtitle="Update the employee record and salary amount"
              accent="bg-[#0A4FE8]"
            />
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="font-semibold text-slate-800">Approved {form.approval_date}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="break-words">{form.edit_reason}</span>
              </div>
              <button type="button" onClick={() => { interacted.current = true; setStep("approval"); }} className="shrink-0 font-semibold text-[#0A4FE8] hover:underline">
                Change approval details
              </button>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name"><Input value={form.name} onChange={(event) => change("name", event.target.value)} className="h-11 rounded-xl" /></Field>
              <Field label="Role"><Input value={form.role} onChange={(event) => change("role", event.target.value)} className="h-11 rounded-xl" /></Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={(event) => change("email", event.target.value)} className="h-11 rounded-xl" /></Field>
              <Field label="Phone"><Input type="tel" value={form.phone} onChange={(event) => change("phone", event.target.value)} className="h-11 rounded-xl" /></Field>
              <Field label="Bank">
                <BankPicker value={form.bank_code} onChange={(code, name) => {
                  interacted.current = true;
                  setDraftRestored(false);
                  setForm((current) => ({ ...current, bank_code: code, bank_name: name }));
                }} />
              </Field>
              <Field label="Account number"><Input value={form.account_number} onChange={(event) => change("account_number", event.target.value)} className="h-11 rounded-xl font-mono" /></Field>
              <Field label="Account name"><Input value={form.account_name} onChange={(event) => change("account_name", event.target.value)} className="h-11 rounded-xl" /></Field>
              <Field label="Salary amount"><Input type="number" min="0" step="0.01" value={form.base_salary} onChange={(event) => change("base_salary", event.target.value)} className="h-11 rounded-xl" /></Field>
              <Field label="Salary currency">
                <select
                  value={form.currency}
                  onChange={(event) => change("currency", event.target.value as Currency)}
                  className="flex h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                >
                  {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency} - {CURRENCY_NAMES[currency]}</option>)}
                </select>
              </Field>
            </div>
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className={`text-xs ${draftState === "error" ? "text-red-600" : "text-slate-400"}`}>{draftLabel}</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { interacted.current = true; setStep("approval"); }} disabled={saving}>
                  <ChevronLeft className="mr-1.5 h-4 w-4" /> Back
                </Button>
                <Button onClick={save} disabled={saving || draftState === "loading"} className="bg-[#0A4FE8] hover:bg-[#083EC0]">
                  {saving ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</> : "Save approved changes"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
