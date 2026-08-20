"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Clock3, Loader2, Mail, RefreshCw, ShieldCheck } from "lucide-react";

interface Challenge {
  pending_email: string;
  expires_at: string;
  resend_available_at: string;
  attempts_remaining: number;
}

interface StatusPayload {
  ok: boolean;
  email: string;
  email_verified_at: string | null;
  email_complete: boolean;
  challenge: Challenge | null;
  otp_ttl_minutes: number;
  resend_seconds: number;
  error?: string;
}

export function EmailVerificationCard({
  email,
  emailVerifiedAt,
  onVerified,
}: {
  email: string;
  emailVerifiedAt: string | null;
  onVerified: (email: string, verifiedAt: string) => void;
}) {
  const [currentEmail, setCurrentEmail] = useState(email);
  const [verifiedAt, setVerifiedAt] = useState(emailVerifiedAt);
  const [emailInput, setEmailInput] = useState(email);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [otp, setOtp] = useState("");
  const [editing, setEditing] = useState(!emailVerifiedAt);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"send" | "verify" | "cancel" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/team/email-verification", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as StatusPayload;
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load email verification.");
        if (cancelled) return;
        setCurrentEmail(payload.email);
        setVerifiedAt(payload.email_verified_at);
        setChallenge(payload.challenge);
        setEmailInput(payload.challenge?.pending_email || payload.email || "");
        setEditing(!payload.email_complete || !!payload.challenge);
      })
      .catch((error) => {
        if (!cancelled) setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load email verification." });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!challenge) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("verify_email") !== "1") return;
    const timer = window.setTimeout(() => {
      document.getElementById("email-verification")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
    return () => window.clearTimeout(timer);
  }, []);

  const expiresIn = useMemo(() => challenge
    ? Math.max(0, Math.ceil((new Date(challenge.expires_at).getTime() - now) / 1000))
    : 0, [challenge, now]);
  const resendIn = useMemo(() => challenge
    ? Math.max(0, Math.ceil((new Date(challenge.resend_available_at).getTime() - now) / 1000))
    : 0, [challenge, now]);
  const verified = !!verifiedAt;

  async function requestCode() {
    setBusy("send");
    setNotice(null);
    try {
      const response = await fetch("/api/team/email-verification", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not send the verification code.");
      setChallenge(payload.challenge);
      setOtp("");
      setNow(Date.now());
      setNotice({ tone: "success", text: payload.message || "Verification code sent." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not send the verification code." });
    } finally {
      setBusy(null);
    }
  }

  async function verifyCode() {
    setBusy("verify");
    setNotice(null);
    try {
      const response = await fetch("/api/team/email-verification", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        if (payload.attempts_remaining === 0 || response.status === 410) {
          setChallenge(null);
        } else if (challenge && typeof payload.attempts_remaining === "number") {
          setChallenge({ ...challenge, attempts_remaining: payload.attempts_remaining });
        }
        throw new Error(payload.error || "Could not verify the code.");
      }
      setCurrentEmail(payload.email);
      setEmailInput(payload.email);
      setVerifiedAt(payload.email_verified_at);
      setChallenge(null);
      setOtp("");
      setEditing(false);
      setNotice({ tone: "success", text: payload.message || "Email verified." });
      onVerified(payload.email, payload.email_verified_at);
      window.dispatchEvent(new Event("refresh-team-session"));
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not verify the code." });
    } finally {
      setBusy(null);
    }
  }

  async function keepCurrentEmail() {
    setBusy("cancel");
    try {
      await fetch("/api/team/email-verification", { method: "DELETE", credentials: "include" });
    } finally {
      setEditing(false);
      setEmailInput(currentEmail);
      setChallenge(null);
      setOtp("");
      setNotice(null);
      setBusy(null);
    }
  }

  function formatCountdown(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  return (
    <section
      id="email-verification"
      data-autosave="off"
      className={`rounded-2xl border p-4 sm:p-5 ${verified ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/70"}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${verified ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {verified ? <BadgeCheck className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[#0D1B39]">Email verification</h2>
            <p className="mt-1 break-all text-[12px] text-slate-600">
              {verified ? `${currentEmail} is verified.` : "Add a valid email address and confirm the code we send you."}
            </p>
            {verifiedAt && (
              <p className="mt-1 text-[10.5px] text-emerald-700">
                Verified {new Date(verifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}
          </div>
        </div>
        {verified && !editing && (
          <button
            type="button"
            onClick={() => { setEditing(true); setNotice(null); }}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Change email
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-[12px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking verification status…
        </div>
      ) : editing ? (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="team-verification-email" className="mb-1.5 block text-[12px] font-medium text-slate-700">Email address</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="team-verification-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={emailInput}
                onChange={(event) => {
                  setEmailInput(event.target.value);
                  if (challenge && event.target.value.trim().toLowerCase() !== challenge.pending_email) setChallenge(null);
                }}
                placeholder="name@company.com"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-[#0D1B39] outline-none focus:border-[#0A4FE8] focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={requestCode}
                disabled={busy !== null || !emailInput.trim() || (!!challenge && resendIn > 0)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-semibold text-white transition hover:bg-[#083EC0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : challenge ? <RefreshCw className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                {challenge ? (resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code") : "Send code"}
              </button>
            </div>
          </div>

          {challenge && (
            <div className="rounded-xl border border-blue-100 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-[#0D1B39]">Code sent to {challenge.pending_email}</p>
                  <p className={`mt-1 inline-flex items-center gap-1 text-[11px] ${expiresIn > 0 ? "text-slate-500" : "text-rose-600"}`}>
                    <Clock3 className="h-3.5 w-3.5" />
                    {expiresIn > 0 ? `Expires in ${formatCountdown(expiresIn)}` : "Code expired. Request a new code."}
                  </p>
                </div>
                <span className="text-[10.5px] text-slate-500">{challenge.attempts_remaining} attempts remaining</span>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  name="email_otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && otp.length === 6 && expiresIn > 0) void verifyCode();
                  }}
                  aria-label="Email OTP verification code"
                  placeholder="6-digit code"
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-center text-[18px] font-semibold text-[#0D1B39] outline-none focus:border-[#0A4FE8] focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={verifyCode}
                  disabled={busy !== null || otp.length !== 6 || expiresIn <= 0}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0D1B39] px-4 text-[12px] font-semibold text-white transition hover:bg-[#071027] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Verify email
                </button>
              </div>
            </div>
          )}

          {verified && (
            <button
              type="button"
              onClick={keepCurrentEmail}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 hover:text-[#0D1B39] disabled:opacity-50"
            >
              {busy === "cancel" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Keep current email
            </button>
          )}
        </div>
      ) : null}

      {notice && (
        <div className={`mt-4 rounded-xl border px-3 py-2.5 text-[12px] ${notice.tone === "success" ? "border-emerald-200 bg-white text-emerald-700" : "border-rose-200 bg-white text-rose-700"}`}>
          {notice.text}
        </div>
      )}
    </section>
  );
}
