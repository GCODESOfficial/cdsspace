'use client';

import { useEffect, useState, use, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Mail, Phone, MessageCircle, MapPin, Banknote, FileText, Handshake, CheckCircle2, Clock, Briefcase, Receipt } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import StatCard from "@/components/finance/StatCard";
import ModalHeader from "@/components/finance/ModalHeader";
import { findBankByCode } from "@/lib/finance/banks";
import { Currency, FinanceContractor, FinanceContractorAssignment, FinanceContractorPayment, formatMoney } from "@/lib/finance/types";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

export default function ContractorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [contractor, setContractor] = useState<FinanceContractor | null>(null);
  const [assignments, setAssignments] = useState<FinanceContractorAssignment[]>([]);
  const [payments, setPayments] = useState<FinanceContractorPayment[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; client: string; currency: Currency }>>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ project_id: "", agreed_amount: "", currency: "NGN" as Currency, notes: "" });
  const [payForm, setPayForm] = useState({ project_id: "", amount: "", currency: "NGN" as Currency, paid_on: new Date().toISOString().slice(0, 10), payment_ref: "", proof_url: "", notes: "" });
  const [uploading, setUploading] = useState(false);
  const proofRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [c, p] = await Promise.all([
      fetch(`/api/admin/finance/contractors/${id}`).then((r) => r.json()),
      fetch("/api/admin/finance/projects").then((r) => r.json()),
    ]);
    setContractor(c.contractor);
    setAssignments(c.assignments ?? []);
    setPayments(c.payments ?? []);
    setProjects(p.projects ?? []);
  };
  useEffect(() => { load(); }, [id]);

  const saveAssign = async () => {
    if (!assignForm.project_id || !assignForm.agreed_amount) return;
    const r = await fetch(`/api/admin/finance/contractors/${id}/assignments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(assignForm) });
    if (r.ok) { setAssignOpen(false); setAssignForm({ project_id: "", agreed_amount: "", currency: "NGN", notes: "" }); load(); }
  };
  const removeAssign = async (aid: string) => {
    if (!(await appConfirm("Remove assignment?"))) return;
    await fetch(`/api/admin/finance/contractor-assignments/${aid}`, { method: "DELETE" }); load();
  };

  const uploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", f); fd.append("folder", "finance/payment-proofs");
    const r = await fetch("/api/admin/finance/upload", { method: "POST", body: fd });
    setUploading(false);
    if (r.ok) { const d = await r.json(); setPayForm((p) => ({ ...p, proof_url: d.url })); }
  };

  const savePay = async () => {
    if (!payForm.amount || !payForm.paid_on) return;
    const r = await fetch(`/api/admin/finance/contractors/${id}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payForm, project_id: payForm.project_id || null }) });
    if (r.ok) { setPayOpen(false); setPayForm({ project_id: "", amount: "", currency: "NGN", paid_on: new Date().toISOString().slice(0, 10), payment_ref: "", proof_url: "", notes: "" }); load(); }
  };
  const removePay = async (pid: string) => {
    if (!(await appConfirm("Delete payment?"))) return;
    await fetch(`/api/admin/finance/contractor-payments/${pid}`, { method: "DELETE" }); load();
  };

  if (!contractor) return <FinanceShell title="Loading…"><div className={`${glassCard} p-10 text-gray-500`}>Loading…</div></FinanceShell>;

  const totalAgreed = assignments.reduce((s, a) => s + Number(a.agreed_amount), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = totalAgreed - totalPaid;
  const bank = contractor.bank_code ? findBankByCode(contractor.bank_code) : null;

  return (
    <FinanceShell
      title={contractor.name}
      subtitle={contractor.business_niche || "Contractor"}
      back={{ href: "/admin/finance/contractors", label: "Contractors" }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Profile */}
        <div className={`${glassCard} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 grid place-items-center text-white text-xl font-bold shadow-lg shadow-violet-500/20">
              {contractor.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{contractor.name}</h3>
              <p className="text-xs text-gray-500">Since {contractor.start_date ? new Date(contractor.start_date).toLocaleDateString() : "—"}</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {contractor.email && <Info icon={Mail}>{contractor.email}</Info>}
            {contractor.phone && <Info icon={Phone}>{contractor.phone}</Info>}
            {contractor.whatsapp && <Info icon={MessageCircle}>{contractor.whatsapp}</Info>}
            {contractor.office_location && <Info icon={MapPin}>{contractor.office_location}</Info>}
            {bank && <Info icon={Banknote}>{bank.name} • {contractor.account_number} ({contractor.account_name})</Info>}
            {contractor.notes && <Info icon={FileText}>{contractor.notes}</Info>}
          </div>
        </div>

        {/* Stats */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-5">
          <StatCard icon={Handshake} label="Agreed Total" value={formatMoney(totalAgreed)} accent="from-blue-500 to-indigo-500" />
          <StatCard icon={CheckCircle2} label="Paid" value={formatMoney(totalPaid)} accent="from-emerald-500 to-teal-500" />
          <StatCard icon={Clock} label="Balance" value={formatMoney(balance)} accent="from-amber-500 to-orange-500" />
        </div>
      </div>

      {/* Assignments */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-gray-900">Project Assignments</h2>
        <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30"><Plus className="w-4 h-4 mr-1" /> Assign Project</Button>
          </DialogTrigger>
          <DialogContent className="bg-white max-w-md rounded-2xl border-0 shadow-2xl p-7">
            <ModalHeader icon={Briefcase} title="Assign to Project" subtitle="Set the agreed contractor amount" />
            <div className="space-y-4 mt-2">
              <Field label="Project">
                <Select value={assignForm.project_id} onValueChange={(v) => {
                  const p = projects.find((x) => x.id === v);
                  setAssignForm({ ...assignForm, project_id: v, currency: p?.currency ?? "NGN" });
                }}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.client}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={`Agreed Amount (${assignForm.currency})`}><Input type="number" className="h-11 rounded-xl" value={assignForm.agreed_amount} onChange={(e) => setAssignForm({ ...assignForm, agreed_amount: e.target.value })} /></Field>
              <Field label="Notes"><Textarea className="rounded-xl" value={assignForm.notes} onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })} /></Field>
            </div>
            <DialogFooter className="mt-5">
              <Button variant="outline" className="rounded-xl" onClick={() => setAssignOpen(false)}>Cancel</Button>
              <Button onClick={saveAssign} className="rounded-xl bg-gradient-to-b from-blue-600 to-blue-700">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {assignments.length === 0 ? (
        <div className={`${glassCard} p-8 text-center text-gray-500 mb-8`}>No projects assigned yet.</div>
      ) : (
        <div className="space-y-3 mb-8">
          {assignments.map((a) => (
            <div key={a.id} className={`${glassCard} p-5 flex items-center justify-between`}>
              <div>
                <div className="font-semibold text-gray-900">{a.project?.name ?? "Project"}</div>
                <div className="text-xs text-gray-500">{a.project?.client}</div>
                {a.notes && <div className="text-xs text-gray-500 mt-1">{a.notes}</div>}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-gray-500">Agreed</div>
                  <div className="font-bold text-gray-900">{formatMoney(a.agreed_amount, a.currency)}</div>
                </div>
                <button onClick={() => removeAssign(a.id)} className="w-9 h-9 rounded-lg hover:bg-red-50 grid place-items-center text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payments */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-gray-900">Payments Made</h2>
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30"><Plus className="w-4 h-4 mr-1" /> Record Payment</Button>
          </DialogTrigger>
          <DialogContent className="bg-white max-w-md rounded-2xl border-0 shadow-2xl p-7">
            <ModalHeader icon={Receipt} title="Record Payment" subtitle="Track payments made to this contractor" accent="from-emerald-500 to-teal-500" />
            <div className="space-y-4 mt-2">
              <Field label="Project (optional)">
                <Select value={payForm.project_id || "_none"} onValueChange={(v) => setPayForm({ ...payForm, project_id: v === "_none" ? "" : v })}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="No project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No project</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.client}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount"><Input type="number" className="h-11 rounded-xl" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></Field>
                <Field label="Date"><Input type="date" className="h-11 rounded-xl" value={payForm.paid_on} onChange={(e) => setPayForm({ ...payForm, paid_on: e.target.value })} /></Field>
              </div>
              <Field label="Payment Reference / ID"><Input className="h-11 rounded-xl" value={payForm.payment_ref} onChange={(e) => setPayForm({ ...payForm, payment_ref: e.target.value })} /></Field>
              <div>
                <Label className="text-xs uppercase tracking-wide text-gray-500">Proof of Payment</Label>
                <input ref={proofRef} type="file" accept="image/*,application/pdf" hidden onChange={uploadProof} />
                <div className="mt-1.5 flex items-center gap-3">
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => proofRef.current?.click()} disabled={uploading}>
                    {uploading ? "Uploading…" : payForm.proof_url ? "Replace File" : "Upload File"}
                  </Button>
                  {payForm.proof_url && <a href={payForm.proof_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">View</a>}
                </div>
              </div>
              <Field label="Notes"><Textarea className="rounded-xl" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></Field>
            </div>
            <DialogFooter className="mt-5">
              <Button variant="outline" className="rounded-xl" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button onClick={savePay} className="rounded-xl bg-gradient-to-b from-blue-600 to-blue-700">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {payments.length === 0 ? (
        <div className={`${glassCard} p-8 text-center text-gray-500`}>No payments recorded yet.</div>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p.id} className={`${glassCard} p-5 flex items-center justify-between`}>
              <div>
                <div className="font-semibold text-gray-900">{formatMoney(p.amount, p.currency)}</div>
                <div className="text-xs text-gray-500">Paid {new Date(p.paid_on).toLocaleDateString()}{p.payment_ref ? ` • Ref: ${p.payment_ref}` : ""}</div>
                {p.notes && <div className="text-xs text-gray-500 mt-1">{p.notes}</div>}
              </div>
              <div className="flex items-center gap-3">
                {p.proof_url && <a href={p.proof_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Proof</a>}
                <button onClick={() => removePay(p.id)} className="w-9 h-9 rounded-lg hover:bg-red-50 grid place-items-center text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
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
function Info({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return <div className="flex items-start gap-2 text-sm text-gray-600"><Icon className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" /><span className="break-all">{children}</span></div>;
}
