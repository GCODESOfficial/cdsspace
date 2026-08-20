"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
import { BotCheck } from "@/components/security/BotCheck";
import { requestClientPasswordReset } from "@/lib/actions/auth";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [botToken, setBotToken] = useState("");
  const [botResetSignal, setBotResetSignal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const onBotTokenChange = useCallback((token: string) => setBotToken(token), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!botToken) {
      setNotice({ ok: false, text: "Complete the security verification first." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await requestClientPasswordReset({ email, botToken });
      setNotice("error" in result
        ? { ok: false, text: result.error }
        : { ok: true, text: result.message || "Check your email for a reset link." });
    } catch {
      setNotice({ ok: false, text: "Password recovery is temporarily unavailable." });
    } finally {
      setBusy(false);
      setBotToken("");
      setBotResetSignal((value) => value + 1);
    }
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold text-brand-navy">Reset your password</h1>
        <p className="mt-2 text-[14px] leading-6 text-brand-body">Enter your client account email. We will send a secure recovery link if the account exists.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-[13px] font-medium text-brand-body" htmlFor="recovery-email">Email address</label>
        <div className="flex min-h-12 items-center gap-3 rounded-xl border border-brand-stroke bg-white px-4 focus-within:border-[#0A4FE8] focus-within:ring-4 focus-within:ring-blue-100">
          <Mail className="h-4 w-4 text-brand-mute" aria-hidden="true" />
          <input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[14px] text-brand-navy outline-none" placeholder="name@company.com" />
        </div>
        <BotCheck action="password_reset" onTokenChange={onBotTokenChange} resetSignal={botResetSignal} />
        {notice && <div className={`rounded-xl border px-3 py-2.5 text-[12px] ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{notice.text}</div>}
        <button type="submit" disabled={busy || !botToken} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[14px] font-semibold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Send recovery link
        </button>
      </form>
      <Link href="/login" className="block text-center text-[13px] font-semibold text-[#0A4FE8] hover:underline">Back to sign in</Link>
    </div>
  );
}
