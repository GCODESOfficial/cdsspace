'use client';

import { useEffect, useState, use } from "react";
import Image from "next/image";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import BankPicker from "@/components/finance/BankPicker";
import { Check, AlertCircle } from "lucide-react";

export default function ContractorOnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<"checking" | "valid" | "invalid" | "submitting" | "done">("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState({
    name: "", business_niche: "", phone: "", whatsapp: "", email: "",
    bank_code: "", bank_name: "", account_name: "", account_number: "",
    office_location: "", start_date: "", notes: "",
  });

  useEffect(() => {
    fetch(`/api/finance/contractor-onboard/${token}`).then(async (r) => {
      if (r.ok) setState("valid");
      else { const d = await r.json(); setErrorMsg(d.error || "Invalid invite"); setState("invalid"); }
    });
  }, [token]);

  const submit = async () => {
    if (!form.name) { alert("Please enter your name"); return; }
    setState("submitting");
    const r = await fetch(`/api/finance/contractor-onboard/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) setState("done");
    else { const d = await r.json(); setErrorMsg(d.error || "Failed"); setState("valid"); }
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Image src="/navbar/CDS Logo.svg" alt="CDS Space" width={56} height={56} />
            <div>
              <div className="text-xl font-bold text-gray-900">CDS Space</div>
              <div className="text-xs text-gray-500">Contractor Onboarding</div>
            </div>
          </div>

          {state === "checking" && (
            <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_10px_40px_rgba(15,40,90,0.06)] p-10 text-center text-gray-500">
              Verifying invite…
            </div>
          )}

          {state === "invalid" && (
            <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_10px_40px_rgba(15,40,90,0.06)] p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-50 grid place-items-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{errorMsg}</h2>
              <p className="text-gray-500 mt-2">Please contact CDS Space for a new invite link.</p>
            </div>
          )}

          {state === "done" && (
            <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_10px_40px_rgba(15,40,90,0.06)] p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 grid place-items-center mx-auto mb-4">
                <Check className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Welcome to CDS Space!</h2>
              <p className="text-gray-500 mt-2">Your details have been received. We&apos;ll be in touch shortly.</p>
            </div>
          )}

          {(state === "valid" || state === "submitting") && (
            <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_10px_40px_rgba(15,40,90,0.06)] p-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Tell us about yourself</h1>
              <p className="text-gray-500 mb-6 text-sm">Fill in your details below so we can add you to our contractor network.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Full Name *"><Input className="h-11 rounded-xl" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Business Niche"><Input className="h-11 rounded-xl" value={form.business_niche} onChange={(e) => setForm({ ...form, business_niche: e.target.value })} placeholder="e.g. Photographer, Developer" /></Field>
                <Field label="Phone"><Input className="h-11 rounded-xl" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                <Field label="WhatsApp"><Input className="h-11 rounded-xl" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></Field>
                <Field label="Email"><Input className="h-11 rounded-xl" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                <Field label="Office Location"><Input className="h-11 rounded-xl" value={form.office_location} onChange={(e) => setForm({ ...form, office_location: e.target.value })} /></Field>
                <Field label="Bank">
                  <BankPicker value={form.bank_code} onChange={(code, name) => setForm({ ...form, bank_code: code, bank_name: name })} />
                </Field>
                <Field label="Account Number"><Input className="h-11 rounded-xl" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></Field>
                <Field label="Account Name"><Input className="h-11 rounded-xl" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} /></Field>
                <Field label="Started Working With CDS"><Input type="date" className="h-11 rounded-xl" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
                <div className="md:col-span-2"><Field label="Anything else?"><Textarea className="rounded-xl" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
              </div>
              <Button onClick={submit} disabled={state === "submitting"} className="mt-6 w-full h-12 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
                {state === "submitting" ? "Submitting…" : "Submit Details"}
              </Button>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs uppercase tracking-wide text-gray-500">{label}</Label><div className="mt-1.5">{children}</div></div>;
}
