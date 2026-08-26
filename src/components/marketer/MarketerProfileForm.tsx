"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Landmark, Loader2, UserRound } from "lucide-react";
import type { MarketerPayoutAccount, MarketerProfile } from "@/lib/marketer-account";
import { SecureProfilePhotoPicker } from "@/components/shared/SecureProfilePhotoPicker";

export function MarketerProfileForm({ profile, payoutAccount, setup }: { profile: MarketerProfile; payoutAccount: MarketerPayoutAccount | null; setup: boolean }) {
  const router = useRouter();
  const [profileSaving, setProfileSaving] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [photoUrl, setPhotoUrl] = useState(profile.profile_photo_url || "");

  async function saveProfile(formData: FormData) {
    setProfileSaving(true); setProfileMessage("");
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/marketer/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setProfileMessage(result.error || "Could not save profile."); setProfileSaving(false); return; }
    if (setup) { router.replace("/marketer"); return; }
    setProfileMessage("Profile saved."); setProfileSaving(false);
  }

  async function saveAccount(formData: FormData) {
    setAccountSaving(true); setAccountMessage("");
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/marketer/payout-account", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    setAccountMessage(response.ok ? "Payout account saved." : result.error || "Could not save payout account.");
    setAccountSaving(false);
  }

  return <div className="space-y-6">
    <header><p className="text-[12px] font-semibold text-[#075BE5]">{setup ? "Step 3 of 3 · Final setup" : "Account settings"}</p><h1 className="mt-2 text-[30px] font-bold tracking-[-.03em] sm:text-[38px]">{setup ? "Create your marketer profile" : "Profile and payout account"}</h1><p className="mt-2 text-[14px] leading-6 text-[#667085]">Choose the code clients will enter before payment. Your ID card and commission record use these verified profile details.</p></header>
    <div className="grid gap-6 xl:grid-cols-[1.08fr_.92fr]">
      <form action={saveProfile} className="rounded-[16px] border border-[#DDE5F4] bg-white p-5 shadow-[0_12px_30px_rgba(4,11,55,.05)] sm:p-6">
        <SectionTitle icon={UserRound} title="Public marketer profile" subtitle="Your code is unique, uppercased, and shown to clients exactly as saved." />
        <div className="mt-6">
          <SecureProfilePhotoPicker
            initialUrl={photoUrl || null}
            endpoint="/api/marketer/avatar"
            name={profile.display_name || profile.full_name || profile.email}
            onUploaded={setPhotoUrl}
          />
        </div>
        <input type="hidden" name="profilePhotoUrl" value={photoUrl} />
        <div className="grid gap-4 sm:grid-cols-2"><Field name="fullName" label="Full legal name" defaultValue={profile.full_name || ""} required /><Field name="displayName" label="Display name" defaultValue={profile.display_name || ""} required /><Field name="phoneNumber" label="Phone number" defaultValue={profile.phone_number || ""} required /><Field name="country" label="Country" defaultValue={profile.country || ""} required /><Field name="city" label="City" defaultValue={profile.city || ""} /><Field name="address" label="Address" defaultValue={profile.address || ""} /><Field name="marketerCode" label="Your marketer code" defaultValue={profile.marketer_code || ""} required className="sm:col-span-2" hint="4–24 letters and numbers. Start with a letter; e.g. CHRIS or GEEVA24." /></div>
        {profileMessage && <p className={`mt-4 rounded-[10px] px-3 py-2 text-[12px] ${profileMessage === "Profile saved." ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{profileMessage}</p>}
        <button disabled={profileSaving} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#0A4FE8] text-[13px] font-semibold text-white disabled:opacity-60">{profileSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{profileSaving ? "Saving profile..." : setup ? "Finish setup and open dashboard" : "Save profile"}</button>
      </form>
      <form action={saveAccount} className="h-fit rounded-[16px] border border-[#DDE5F4] bg-white p-5 shadow-[0_12px_30px_rgba(4,11,55,.05)] sm:p-6">
        <SectionTitle icon={Landmark} title="Payout account" subtitle="Used only for approved commission payouts. Keep the account in your selected currency." />
        <div className="mt-6 grid gap-4"><label><span className="mb-2 block text-[11px] font-semibold text-[#475467]">Account type</span><select name="accountType" defaultValue={payoutAccount?.account_type || "bank"} className="h-12 w-full rounded-[12px] border border-[#DDE5F4] bg-white px-3 text-[13px]"><option value="bank">Bank account</option><option value="mobile_money">Mobile money</option></select></label><Field name="accountName" label="Account name" defaultValue={payoutAccount?.account_name || ""} required /><Field name="bankName" label="Bank or provider" defaultValue={payoutAccount?.bank_name || ""} required /><Field name="accountNumber" label="Account number" defaultValue={payoutAccount?.account_number || ""} required /><Field name="bankCode" label="Bank / routing code (optional)" defaultValue={payoutAccount?.bank_code || ""} /><Field name="country" label="Account country" defaultValue={payoutAccount?.country || profile.country || ""} required /></div>
        <input type="hidden" name="currency" value={profile.billing_currency || "USD"} />
        {accountMessage && <p className={`mt-4 rounded-[10px] px-3 py-2 text-[12px] ${accountMessage === "Payout account saved." ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{accountMessage}</p>}
        <button disabled={accountSaving} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[12px] border border-[#BFD2FF] bg-blue-50 text-[13px] font-semibold text-[#075BE5] disabled:opacity-60">{accountSaving ? <Loader2 className="size-4 animate-spin" /> : <Landmark className="size-4" />}{accountSaving ? "Saving account..." : "Save payout account"}</button>
        <p className="mt-3 text-[10px] leading-4 text-[#98A2B3]">Payout details are private and never printed on your marketer ID card.</p>
      </form>
    </div>
  </div>;
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: typeof UserRound; title: string; subtitle: string }) { return <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-blue-50 text-[#075BE5]"><Icon className="size-5" /></span><div><h2 className="text-[15px] font-semibold">{title}</h2><p className="mt-1 text-[11px] leading-5 text-[#667085]">{subtitle}</p></div></div>; }
function Field({ name, label, defaultValue, type = "text", required = false, className = "", hint }: { name: string; label: string; defaultValue: string; type?: string; required?: boolean; className?: string; hint?: string }) { return <label className={className}><span className="mb-2 block text-[11px] font-semibold text-[#475467]">{label}</span><input name={name} type={type} required={required} defaultValue={defaultValue} className="h-12 w-full rounded-[12px] border border-[#DDE5F4] px-4 text-[13px] uppercase-[initial] outline-none focus:border-[#075BE5] focus:ring-4 focus:ring-blue-100" />{hint && <span className="mt-1.5 block text-[10px] text-[#98A2B3]">{hint}</span>}</label>; }
