'use client';

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import ModalHeader from "@/components/finance/ModalHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, Wallet, TrendingUp, Clock } from "lucide-react";
import { Currency, formatMoney, FinanceProject, FinanceMilestone } from "@/lib/finance/types";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";

const STATUS_PILL: Record<string, string> = {
  pending:     "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
  in_progress: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  completed:   "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  paid:        "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200",
};

export default function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<FinanceProject | null>(null);
  const [milestones, setMilestones] = useState<FinanceMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceMilestone | null>(null);
  const empty = { description: "", budget: "", assigned_to: "", duration_start: "", duration_end: "", payment_basis: "milestone" as "milestone" | "monthly", monthly_amount: "", paid_amount: "", status: "pending" as FinanceMilestone["status"] };
  const [form, setForm] = useState(empty);

  const load = async () => {
    setLoading(true);
    const r = await fetch(`/api/admin/finance/projects/${id}`);
    const d = await r.json();
    setProject(d.project);
    setMilestones(d.milestones ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (m: FinanceMilestone) => {
    setEditing(m);
    setForm({
      description: m.description, budget: String(m.budget), assigned_to: m.assigned_to ?? "",
      duration_start: m.duration_start ?? "", duration_end: m.duration_end ?? "",
      payment_basis: m.payment_basis, monthly_amount: m.monthly_amount ? String(m.monthly_amount) : "",
      paid_amount: String(m.paid_amount), status: m.status,
    });
    setOpen(true);
  };

  const save = async () => {
    const payload = {
      description: form.description,
      budget: Number(form.budget || 0),
      assigned_to: form.assigned_to || null,
      duration_start: form.duration_start || null,
      duration_end: form.duration_end || null,
      payment_basis: form.payment_basis,
      monthly_amount: form.payment_basis === "monthly" ? Number(form.monthly_amount || 0) : null,
      paid_amount: Number(form.paid_amount || 0),
      status: form.status,
    };
    const url = editing ? `/api/admin/finance/milestones/${editing.id}` : `/api/admin/finance/projects/${id}/milestones`;
    const method = editing ? "PATCH" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) { setOpen(false); load(); } else { const d = await r.json(); alert(d.error || "Failed"); }
  };

  const remove = async (mid: string) => {
    if (!confirm("Delete this milestone?")) return;
    await fetch(`/api/admin/finance/milestones/${mid}`, { method: "DELETE" });
    load();
  };

  const removeProject = async () => {
    if (!confirm("Delete this project and all its milestones? This cannot be undone.")) return;
    const r = await fetch(`/api/admin/finance/projects/${id}`, { method: "DELETE" });
    if (r.ok) window.location.href = "/admin/finance/projects";
  };

  if (loading || !project) {
    return (
      <FinanceShell title="Loading…">
        <div className={`${glassCard} p-10 text-gray-500`}>Loading project…</div>
      </FinanceShell>
    );
  }

  const currency = project.currency as Currency;
  const totalBudget = milestones.reduce((s, m) => s + Number(m.budget || 0), 0);
  const totalPaid = milestones.reduce((s, m) => s + Number(m.paid_amount || 0), 0);
  const balance = totalBudget - totalPaid;
  const progress = totalBudget > 0 ? Math.min(100, Math.round((totalPaid / totalBudget) * 100)) : 0;

  return (
    <FinanceShell
      title={project.name}
      subtitle={`${project.client} • ${currency}`}
      back={{ href: "/admin/finance/projects", label: "All Projects" }}
      actions={
        <>
          <Button variant="outline" onClick={removeProject} className="h-11 px-4 rounded-xl text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
            Delete Project
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
                <Plus className="w-4 h-4 mr-1.5" /> Add Milestone
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-xl rounded-2xl border-0 shadow-2xl p-7 max-h-[92vh] overflow-y-auto">
              <ModalHeader icon={Clock} title={editing ? "Edit Milestone" : "Add Milestone"} subtitle="Define scope, budget and payment basis" />
              <div className="space-y-4 mt-2">
                <Field label="Description"><Input className="h-11 rounded-xl" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What needs to be done?" /></Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Budget"><Input type="number" className="h-11 rounded-xl" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
                  <Field label="Assigned To"><Input className="h-11 rounded-xl" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Start"><Input type="date" className="h-11 rounded-xl" value={form.duration_start} onChange={(e) => setForm({ ...form, duration_start: e.target.value })} /></Field>
                  <Field label="End"><Input type="date" className="h-11 rounded-xl" value={form.duration_end} onChange={(e) => setForm({ ...form, duration_end: e.target.value })} /></Field>
                </div>
                <Field label="Payment Basis">
                  <Select value={form.payment_basis} onValueChange={(v) => setForm({ ...form, payment_basis: v as "milestone" | "monthly" })}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="milestone">Per Milestone</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {form.payment_basis === "monthly" && (
                  <Field label="Monthly Amount"><Input type="number" className="h-11 rounded-xl" value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })} /></Field>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Paid Amount"><Input type="number" className="h-11 rounded-xl" value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} /></Field>
                  <Field label="Status">
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as FinanceMilestone["status"] })}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
              <DialogFooter className="mt-5">
                <Button variant="outline" className="h-11 px-5 rounded-xl" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      {/* Stat row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <BigStat icon={Wallet} label="Total Budget" value={formatMoney(totalBudget, currency)} accent="from-blue-500 to-indigo-500" />
        <BigStat icon={TrendingUp} label="Paid" value={formatMoney(totalPaid, currency)} accent="from-emerald-500 to-teal-500" sub={`${progress}% complete`} />
        <BigStat icon={Clock} label="Balance" value={formatMoney(balance, currency)} accent="from-amber-500 to-orange-500" />
      </div>

      {/* Progress bar */}
      <div className={`${glassCard} p-6 mb-8`}>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-600 font-medium">Project Progress</span>
          <span className="text-gray-900 font-semibold">{progress}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Milestones */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Milestones</h2>
        <span className="text-sm text-gray-500">{milestones.length} total</span>
      </div>

      {milestones.length === 0 ? (
        <div className={`${glassCard} p-12 text-center`}>
          <p className="text-gray-500">No milestones yet. Add your first one to start tracking.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {milestones.map((m, i) => {
            const bal = Number(m.budget) - Number(m.paid_amount);
            const mProgress = Number(m.budget) > 0 ? Math.min(100, Math.round((Number(m.paid_amount) / Number(m.budget)) * 100)) : 0;
            return (
              <div key={m.id} className={`${glassCard} p-5`}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 grid place-items-center text-white font-semibold flex-shrink-0 shadow-lg shadow-blue-600/20">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-gray-900">{m.description}</h4>
                      <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${STATUS_PILL[m.status]}`}>{m.status.replace("_", " ")}</span>
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 ring-1 ring-slate-200">{m.payment_basis}</span>
                    </div>
                    {m.assigned_to && <p className="text-xs text-gray-500 mt-1">Assigned to {m.assigned_to}</p>}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
                      <div><span className="text-gray-500">Budget:</span> <b className="text-gray-900">{formatMoney(m.budget, currency)}</b></div>
                      <div><span className="text-gray-500">Paid:</span> <b className="text-emerald-700">{formatMoney(m.paid_amount, currency)}</b></div>
                      <div><span className="text-gray-500">Balance:</span> <b className="text-amber-700">{formatMoney(bal, currency)}</b></div>
                      {m.payment_basis === "monthly" && m.monthly_amount && (
                        <div><span className="text-gray-500">Monthly:</span> <b className="text-gray-900">{formatMoney(m.monthly_amount, currency)}</b></div>
                      )}
                    </div>
                    <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style={{ width: `${mProgress}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(m)} className="w-9 h-9 rounded-xl hover:bg-blue-50 grid place-items-center text-gray-500 hover:text-blue-600 transition"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => remove(m.id)} className="w-9 h-9 rounded-xl hover:bg-red-50 grid place-items-center text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </FinanceShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-gray-500">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function BigStat({ icon: Icon, label, value, accent, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent: string; sub?: string }) {
  return (
    <div className={`${glassCard} p-6`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent} grid place-items-center shadow-lg shadow-blue-600/10`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
