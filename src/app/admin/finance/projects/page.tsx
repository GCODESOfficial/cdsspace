'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Briefcase, Calendar, ArrowRight, Wallet, Banknote } from "lucide-react";
import { CURRENCIES, Currency, formatMoney } from "@/lib/finance/types";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import StatCard from "@/components/finance/StatCard";
import ModalHeader from "@/components/finance/ModalHeader";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface ProjectRow {
  id: string;
  name: string;
  client: string;
  currency: Currency;
  status: string;
  duration_start: string | null;
  duration_end: string | null;
  total_budget: number;
  total_paid: number;
  milestone_count: number;
}

const STATUS_STYLES: Record<string, string> = {
  new:             "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  active:          "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  completed:       "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  paused:          "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  delayed:         "bg-red-50 text-red-700 ring-1 ring-red-200",
  awaiting_client: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  under_review:    "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  archived:        "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", client: "", currency: "NGN" as Currency, duration_start: "", duration_end: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/admin/finance/projects");
    const d = await r.json();
    setProjects(d.projects ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim() || !form.client.trim()) {
      appAlert("Project name and client are required.");
      return;
    }
    if (form.duration_start && form.duration_end && form.duration_end < form.duration_start) {
      appAlert("End date cannot be before the start date.");
      return;
    }
    setSaving(true);
    const r = await fetch("/api/admin/finance/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (r.ok) {
      setOpen(false);
      setForm({ name: "", client: "", currency: "NGN", duration_start: "", duration_end: "", notes: "" });
      load();
    } else {
      const d = await r.json();
      appAlert(d.error || "Failed");
    }
  };

  const totals = projects.reduce(
    (acc, p) => {
      acc.budget += Number(p.total_budget || 0);
      acc.paid += Number(p.total_paid || 0);
      return acc;
    },
    { budget: 0, paid: 0 }
  );

  return (
    <FinanceShell
      title="Projects"
      subtitle="Every active engagement, milestones, and payment progress."
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-600 hover:to-blue-800 shadow-lg shadow-blue-600/30">
              <Plus className="w-4 h-4 mr-1.5" /> New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white max-w-xl rounded-2xl border-0 shadow-2xl p-7">
            <ModalHeader icon={Briefcase} title="Create Project" subtitle="Set up a new client engagement" />
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-xs uppercase tracking-wide text-gray-500">Project Name</Label>
                <Input className="h-11 rounded-xl mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Website Redesign" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-gray-500">Client</Label>
                <Input className="h-11 rounded-xl mt-1.5" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="Client name" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-gray-500">Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
                  <SelectTrigger className="h-11 rounded-xl mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-gray-500">Start</Label>
                  <Input type="date" className="h-11 rounded-xl mt-1.5" value={form.duration_start} onChange={(e) => setForm({ ...form, duration_start: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-gray-500">End</Label>
                  <Input type="date" className="h-11 rounded-xl mt-1.5" value={form.duration_end} onChange={(e) => setForm({ ...form, duration_end: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-gray-500">Notes</Label>
                <Textarea className="rounded-xl mt-1.5 min-h-[80px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <p className="text-xs text-gray-500 bg-blue-50/60 border border-blue-100 rounded-xl p-3">
                Total budget is calculated automatically from milestones once you add them.
              </p>
            </div>
            <DialogFooter className="mt-5">
              <Button variant="outline" className="h-11 px-5 rounded-xl" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={create} disabled={saving} className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
                {saving ? "Creating…" : "Create Project"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {/* summary stat row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatCard icon={Briefcase} label="Total Projects" value={String(projects.length)} accent="from-blue-500 to-indigo-500" />
        <StatCard icon={Wallet} label="Combined Budget" value={formatMoney(totals.budget)} accent="from-emerald-500 to-teal-500" />
        <StatCard icon={Banknote} label="Combined Paid" value={formatMoney(totals.paid)} accent="from-fuchsia-500 to-pink-500" />
      </div>

      {loading ? (
        <div className={`${glassCard} p-10 text-center text-gray-500`}>Loading…</div>
      ) : projects.length === 0 ? (
        <div className={`${glassCard} p-14 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-blue-50 grid place-items-center mx-auto mb-4">
            <Briefcase className="w-7 h-7 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No projects yet</h3>
          <p className="text-gray-500 mt-1">Create your first project to start tracking milestones and budgets.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((p) => {
            const progress = p.total_budget > 0 ? Math.min(100, Math.round((p.total_paid / p.total_budget) * 100)) : 0;
            return (
              <Link key={p.id} href={`/admin/finance/projects/${p.id}`} className="group">
                <div className={`${glassCard} p-6 h-full transition hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(15,40,90,0.10)]`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 grid place-items-center text-white font-semibold shadow-lg shadow-blue-600/20">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 leading-tight">{p.name}</h3>
                        <p className="text-xs text-gray-500">{p.client}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[p.status] ?? STATUS_STYLES.new}`}>{p.status.replace(/_/g, " ")}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl bg-gray-50/80 px-3 py-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500">Budget</div>
                      <div className="font-semibold text-gray-900">{formatMoney(p.total_budget, p.currency)}</div>
                    </div>
                    <div className="rounded-xl bg-emerald-50/80 px-3 py-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-emerald-700">Paid</div>
                      <div className="font-semibold text-emerald-800">{formatMoney(p.total_paid, p.currency)}</div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-[11px] text-gray-500 mb-1.5">
                      <span>Progress</span><span>{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {p.milestone_count} milestone{p.milestone_count === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-blue-600 font-medium group-hover:gap-2 transition-all">
                      Open <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </FinanceShell>
  );
}

