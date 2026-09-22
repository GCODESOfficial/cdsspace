"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, LockKeyhole } from "lucide-react";
import { completeClientPasswordReset } from "@/lib/actions/auth";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      // The single-use token from the emailed link is what authorises the reset.
      const token = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("token");
      const result = await completeClientPasswordReset({ password, confirmPassword, token });
      setNotice({
        ok: Boolean(result.success),
        text: result.error || "Password updated. Sign in with your new password and email code.",
      });
      if (result.success) {
        setPassword("");
        setConfirmPassword("");
      }
    } catch {
      setNotice({ ok: false, text: "The password could not be updated." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold text-brand-navy">Choose a new password</h1>
        <p className="mt-2 text-[14px] leading-6 text-brand-body">Resetting your password clears the five-attempt lock and signs out existing sessions.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {[
          { id: "new-password", label: "New password", value: password, set: setPassword, autocomplete: "new-password" },
          { id: "confirm-password", label: "Confirm password", value: confirmPassword, set: setConfirmPassword, autocomplete: "new-password" },
        ].map((field) => (
          <div key={field.id}>
            <label htmlFor={field.id} className="mb-1.5 block text-[13px] font-medium text-brand-body">{field.label}</label>
            <div className="flex min-h-12 items-center gap-3 rounded-xl border border-brand-stroke bg-white px-4 focus-within:border-[#0A4FE8] focus-within:ring-4 focus-within:ring-blue-100">
              <LockKeyhole className="h-4 w-4 text-brand-mute" aria-hidden="true" />
              <input id={field.id} type="password" autoComplete={field.autocomplete} required minLength={8} maxLength={128} value={field.value} onChange={(event) => field.set(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[14px] text-brand-navy outline-none" />
            </div>
          </div>
        ))}
        <p className="text-[11px] leading-5 text-brand-mute">Use 8–128 characters with uppercase, lowercase, a number and a symbol.</p>
        {notice && <div className={`rounded-xl border px-3 py-2.5 text-[12px] ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{notice.text}</div>}
        <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[14px] font-semibold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Update password
        </button>
      </form>
      {notice?.ok && <Link href="/login" className="block text-center text-[13px] font-semibold text-[#0A4FE8] hover:underline">Continue to secure sign in</Link>}
    </div>
  );
}

