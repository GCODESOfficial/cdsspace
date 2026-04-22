'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Users, Link2, Copy, Check, UserPlus } from "lucide-react";
import ModalHeader from "@/components/finance/ModalHeader";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import BankPicker from "@/components/finance/BankPicker";
import { findBankByCode } from "@/lib/finance/banks";
import type { FinanceContractor } from "@/lib/finance/types";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

const EMPTY = {
  name: "", business_niche: "", phone: "", whatsapp: "", email: "",
  bank_code: "", bank_name: "", account_name: "", account_number: "",
  office_location: "", start_date: "", notes: "",
};

export default function ContractorsPage() {
  const [list, setList] = useState<FinanceContractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/admin/finance/contractors");
    const d = await r.json();
    setList(d.contractors ?? []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name) return;
    const r = await fetch("/api/admin/finance/contractors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) { setOpen(false); setForm(EMPTY); load(); } else appAlert("Failed");
  };

  const generateInvite = async () => {
    const r = await fetch("/api/admin/finance/contractor-invites", { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      const url = `${window.location.origin}/contractor-onboard/${d.invite.token}`;
      setInviteUrl(url);
    }
  };

  const copyInvite = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <FinanceShell
      title="Contractors"
      subtitle="Team & contractor management."
      actions={
        <>
          <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={generateInvite}>
            <Link2 className="w-4 h-4 mr-1.5" /> Generate Invite Link
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
                <Plus className="w-4 h-4 mr-1.5" /> New Contractor
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-2xl rounded-2xl border-0 shadow-2xl p-7 max-h-[92vh] overflow-y-auto">
              <ModalHeader icon={UserPlus} title="New Contractor" subtitle="Add a new contractor to your team" accent="from-violet-500 to-purple-500" />
              <div className="grid grid-cols-2 gap-4 mt-2">
                <Field label="Full Name"><Input className="h-11 rounded-xl" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Business Niche"><Input className="h-11 rounded-xl" value={form.business_niche} onChange={(e) => setForm({ ...form, business_niche: e.target.value })} /></Field>
                <Field label="Phone"><Input className="h-11 rounded-xl" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                <Field label="WhatsApp"><Input className="h-11 rounded-xl" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></Field>
                <Field label="Email"><Input className="h-11 rounded-xl" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                <Field label="Office Location"><Input className="h-11 rounded-xl" value={form.office_location} onChange={(e) => setForm({ ...form, office_location: e.target.value })} /></Field>
                <Field label="Bank">
                  <BankPicker value={form.bank_code} onChange={(code, name) => setForm({ ...form, bank_code: code, bank_name: name })} />
                </Field>
                <Field label="Account Number"><Input className="h-11 rounded-xl" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></Field>
                <Field label="Account Name"><Input className="h-11 rounded-xl" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} /></Field>
                <Field label="Started On"><Input type="date" className="h-11 rounded-xl" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
                <div className="col-span-2"><Field label="Notes"><Textarea className="rounded-xl" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
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
      {inviteUrl && (
        <div className={`${glassCard} p-5 mb-6 flex items-center gap-4`}>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">One-time invite link (expires in 7 days)</div>
            <div className="text-sm font-mono text-gray-700 truncate">{inviteUrl}</div>
          </div>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={copyInvite}>
            {copied ? <><Check className="w-4 h-4 mr-1" />Copied</> : <><Copy className="w-4 h-4 mr-1" />Copy</>}
          </Button>
        </div>
      )}

      {loading ? (
        <div className={`${glassCard} p-10 text-center text-gray-500`}>Loading…</div>
      ) : list.length === 0 ? (
        <div className={`${glassCard} p-14 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-violet-50 grid place-items-center mx-auto mb-4">
            <Users className="w-7 h-7 text-violet-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No contractors yet</h3>
          <p className="text-gray-500 mt-1">Add a contractor or generate a public invite link.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((c) => (
            <Link key={c.id} href={`/admin/finance/contractors/${c.id}`}>
              <div className={`${glassCard} p-5 hover:-translate-y-0.5 transition`}>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 grid place-items-center text-white font-semibold shadow-lg shadow-violet-500/20">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{c.name}</h3>
                    {c.business_niche && <p className="text-xs text-gray-500">{c.business_niche}</p>}
                    {c.phone && <p className="text-xs text-gray-500 mt-1">{c.phone}</p>}
                  </div>
                  {c.source === "public" && <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">self</span>}
                </div>
                {c.bank_code && <div className="text-xs text-gray-500 mt-3">{findBankByCode(c.bank_code)?.name} • {c.account_number}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </FinanceShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs uppercase tracking-wide text-gray-500">{label}</Label><div className="mt-1.5">{children}</div></div>;
}
