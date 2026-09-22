"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { marketerLogin, marketerSignup } from "@/lib/actions/marketer-auth";
import { GoogleAuthButton } from "@/components/marketing/GoogleAuthButton";
import { LinkedInAuthButton } from "@/components/marketing/LinkedInAuthButton";

/** Why a social sign-in attempt bounced back here, in the visitor's words. */
function oauthErrorMessage(code: string) {
  switch (code) {
    case "google_disabled":
      return "Google sign-in is not enabled for this project yet. Use your email and password, or try again shortly.";
    case "google_start_failed":
      return "We could not start Google sign-in. Please try again.";
    case "linkedin_disabled":
      return "LinkedIn sign-in is not enabled for this project yet. Use your email and password, or try again shortly.";
    case "linkedin_start_failed":
      return "We could not start LinkedIn sign-in. Please try again.";
    case "linkedin_cancelled":
      return "LinkedIn sign-in was cancelled. Please try again when you are ready.";
    case "linkedin_state_failed":
      return "The LinkedIn sign-in request expired. Please start again.";
    case "linkedin_callback_failed":
      return "LinkedIn sign-in could not be completed. Please try again.";
    case "auth_code_exchange_failed":
      return "Sign-in did not complete. Please try again.";
    default:
      return decodeURIComponent(code).replace(/\+/g, " ");
  }
}

export function MarketerAuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // A failed social sign-in round trip returns here with a reason. Without this the
  // visitor is bounced back to an untouched form and told nothing.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    const account = params.get("account");
    if (code) setError(oauthErrorMessage(code));
    else if (account === "inactive") setError("This marketer account is not active.");
    if (code || account) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function submit(formData: FormData) {
    setLoading(true);
    setError("");
    setNotice("");
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const fullName = String(formData.get("fullName") || "").trim();
    const result = mode === "login"
      ? await marketerLogin({ email, password })
      : await marketerSignup({ email, password, fullName });
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    if ("confirmationRequired" in result && result.confirmationRequired) {
      setNotice("Check your email to confirm your account, then return here to sign in.");
      setLoading(false);
      return;
    }
    window.location.replace(result.next || "/marketer");
  }

  return (
    <div className="min-h-screen bg-[#F3F6FD] px-5 py-8 lg:grid lg:grid-cols-[1.05fr_.95fr] lg:gap-8 lg:p-8">
      <section className="hidden overflow-hidden rounded-[16px] bg-[#0A4FE8] p-12 text-white lg:flex lg:flex-col">
        <Image src="/navbar/CDS Logo.svg" alt="CDS Space" width={82} height={40} className="brightness-0 invert" />
        <div className="my-auto max-w-[560px]">
          <p className="mb-5 text-[12px] font-bold uppercase tracking-[0.16em] text-white/70">CDS Space Brand Marketers</p>
          <h1 className="text-[54px] font-bold leading-[1.02] tracking-[-0.04em]">Bring the right brands. Earn 5% when they pay.</h1>
          <p className="mt-6 max-w-[500px] text-[17px] leading-7 text-white/80">Your code, attributed invoices, commission history, payout account and official marketer ID, together in one dedicated portal.</p>
        </div>
        <p className="text-[12px] text-white/65">CDS Space is accessible from every country, let&apos;s partner together.</p>
      </section>

      <main className="mx-auto flex w-full max-w-[540px] items-center py-10">
        <div className="w-full rounded-[16px] border border-[#DDE5F4] bg-white p-6 shadow-[0_24px_70px_rgba(4,11,55,0.08)] sm:p-10">
          <Image src="/navbar/CDS Logo.svg" alt="CDS Space" width={68} height={34} className="mb-10 lg:hidden" />
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#075BE5]">Marketer portal</p>
          <h2 className="mt-2 text-[32px] font-bold tracking-[-0.03em] text-[#040B37]">{mode === "login" ? "Welcome back" : "Create your marketer account"}</h2>
          <p className="mt-2 text-[14px] leading-6 text-[#667085]">{mode === "login" ? "Sign in to view your attributed earnings and profile." : "Start with your legal name and work email. Verification follows onboarding."}</p>

          <div className="mt-7 grid grid-cols-2 rounded-[12px] bg-[#F3F6FD] p-1">
            {(["login", "signup"] as const).map((item) => (
              <button key={item} type="button" onClick={() => { setMode(item); setError(""); setNotice(""); }} className={`h-10 rounded-[8px] text-[13px] font-semibold ${mode === item ? "bg-white text-[#075BE5] shadow-sm" : "text-[#667085]"}`}>{item === "login" ? "Sign in" : "Create account"}</button>
            ))}
          </div>

          <form action={submit} className="mt-6 space-y-4">
            {mode === "signup" && <Field name="fullName" label="Full legal name" type="text" placeholder="Your full name" autoComplete="name" />}
            <Field name="email" label="Email address" type="email" placeholder="name@company.com" autoComplete="email" />
            <Field name="password" label="Password" type="password" placeholder="At least 8 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} />
            {error && <p role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-600">{error}</p>}
            {notice && <p className="rounded-[12px] border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] font-medium text-blue-700">{notice}</p>}
            <button disabled={loading} className="flex h-13 w-full items-center justify-center gap-2 rounded-[12px] bg-[#0A4FE8] text-[14px] font-semibold text-white shadow-[0_10px_24px_rgba(5,90,230,0.22)] disabled:opacity-60">
              {loading ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
              {loading ? "Please wait..." : mode === "login" ? "Sign in to marketer portal" : "Create marketer account"}
            </button>
          </form>
          {/* Social sign-in finalises against the /marketer destination and
              lands in this portal rather than the client dashboard. */}
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#DDE5F4]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">or</span>
            <span className="h-px flex-1 bg-[#DDE5F4]" />
          </div>

          <div className="space-y-3">
            <GoogleAuthButton
              label={mode === "login" ? "Continue with Google" : "Sign up with Google"}
              next="/marketer"
              className="flex h-13 w-full items-center justify-center gap-3 rounded-[12px] border border-[#DDE5F4] bg-white transition hover:border-[#075BE5]/50 hover:bg-[#F3F6FD] active:scale-[0.99]"
            />
            <LinkedInAuthButton
              label={mode === "login" ? "Continue with LinkedIn" : "Sign up with LinkedIn"}
              next="/marketer"
              className="flex h-13 w-full items-center justify-center gap-3 rounded-[12px] border border-[#DDE5F4] bg-white transition hover:border-[#075BE5]/50 hover:bg-[#F3F6FD] active:scale-[0.99]"
            />
          </div>

          <p className="mt-6 text-center text-[11px] leading-5 text-[#98A2B3]">This portal is separate from the CDS Space client dashboard.</p>
        </div>
      </main>
    </div>
  );
}

function Field({ name, label, type, placeholder, autoComplete }: { name: string; label: string; type: string; placeholder: string; autoComplete: string }) {
  return <label className="block"><span className="mb-2 block text-[12px] font-semibold text-[#344054]">{label}</span><input required name={name} type={type} minLength={type === "password" ? 8 : undefined} placeholder={placeholder} autoComplete={autoComplete} className="h-12 w-full rounded-[12px] border border-[#DDE5F4] bg-white px-4 text-[14px] text-[#040B37] outline-none transition focus:border-[#075BE5] focus:ring-4 focus:ring-blue-100" /></label>;
}
