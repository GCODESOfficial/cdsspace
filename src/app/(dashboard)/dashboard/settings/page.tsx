"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle, ArrowRightLeft, Banknote, CalendarRange, Check, Clock3, CreditCard, Eye, EyeOff, KeyRound, Loader2, LockKeyhole,
  Link2, Save, Settings2, ShieldCheck, Trash2, UserRound, WalletCards, X,
} from "lucide-react";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";
import { CLIENT_BILLING_CURRENCY_OPTIONS, normalizeClientBillingCurrency } from "@/lib/client-billing";
import { SecureProfilePhotoPicker } from "@/components/shared/SecureProfilePhotoPicker";
import { appConfirm } from "@/lib/app-notify";

interface PaymentMethod {
  id: string;
  provider: "paystack";
  payment_email: string;
  channel: string;
  card_type: string | null;
  card_brand: string | null;
  last4: string | null;
  exp_month: string | null;
  exp_year: string | null;
  bank: string | null;
  country_code: string | null;
  reusable: boolean;
  updated_at: string;
}

interface PaymentMethodResponse {
  configured: boolean;
  mode: "live" | "test" | "unconfigured";
  currency: string;
  available: boolean;
  setup: { amount: number; currency: string } | null;
  method: PaymentMethod | null;
}

type Notice = { type: "success" | "error" | "info"; text: string } | null;

type AuthProvider = "google" | "linkedin";
interface AuthConnection {
  provider: AuthProvider;
  email: string;
  connectedAt: string;
  lastUsedAt: string;
}

export default function ClientSettingsPage() {
  const { account, updateAccount } = useClientAccount();
  const [fullName, setFullName] = useState(account.fullName);
  const [companyName, setCompanyName] = useState(account.companyName);
  const [phoneNumber, setPhoneNumber] = useState(account.phoneNumber);
  const [avatarUrl, setAvatarUrl] = useState(account.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Notice>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (fullName.trim().length < 2) {
      setMessage({ type: "error", text: "Enter your full name." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/client/account/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, companyName, phoneNumber }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not save your account configuration.");
      }

      updateAccount({
        fullName: payload.profile?.fullName || fullName.trim(),
        companyName: payload.profile?.companyName || "",
        phoneNumber: payload.profile?.phoneNumber || "",
      });
      setMessage({ type: "success", text: "Account configuration saved." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Could not save your account configuration.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] p-5 sm:p-6 lg:p-8">
      <header className="mb-7 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-blue-50 text-brand-blue">
          <Settings2 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-brand-navy sm:text-[32px]">Account Config</h1>
          <p className="mt-1 text-sm text-brand-body/60">Manage your profile, sign-in security and payment preferences.</p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <form onSubmit={save} className="rounded-[16px] border border-brand-stroke/70 bg-white p-5 shadow-[0_10px_40px_rgba(15,40,90,0.05)] sm:p-6">
            <SectionHeading icon={UserRound} title="Profile details" />
            <SecureProfilePhotoPicker
              initialUrl={avatarUrl}
              endpoint="/api/client/account/avatar"
              name={fullName || account.email}
              onUploaded={(url) => {
                setAvatarUrl(url);
                updateAccount({ avatarUrl: url });
              }}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Full legal name" value={fullName} onChange={setFullName} autoComplete="name" />
              <Field label="Company" value={companyName} onChange={setCompanyName} autoComplete="organization" />
              <Field label="Phone number" value={phoneNumber} onChange={setPhoneNumber} autoComplete="tel" />
              <ReadOnlyField label="Email address" value={account.email} />
            </div>
            <NoticeBox notice={message} />
            <button type="submit" disabled={saving} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#0A4FE8] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(5,90,230,0.2)] disabled:opacity-60 sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save profile"}
            </button>
          </form>

          <BillingCurrencySection />
          <PasswordSection />
          <ConnectedAccountsSection />
          <PaymentMethodSection />
          <CloseAccountSection accountEmail={account.email} />
        </div>

        <aside className="space-y-4">
          <section className="rounded-[16px] border border-blue-100 bg-blue-50/70 p-5">
            <div className="mb-3 flex items-center gap-2 text-brand-navy"><ShieldCheck className="h-5 w-5 text-brand-blue" /><h2 className="font-semibold">Active user ID</h2></div>
            <code className="block rounded-[8px] bg-white px-3 py-2 text-[13px] font-semibold tracking-[0.08em] text-brand-body">{account.publicUserId}</code>
            <p className="mt-3 text-xs leading-relaxed text-brand-body/65">Messages, invoices, orders, documents and account configuration are scoped to this ID.</p>
          </section>

          <section className="rounded-[16px] border border-brand-stroke/70 bg-white p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-emerald-50 text-emerald-600"><LockKeyhole className="h-4 w-4" /></span>
              <div><h2 className="text-sm font-semibold text-brand-navy">Session protected</h2><p className="mt-1 text-xs leading-relaxed text-brand-body/60">Your dashboard session remains tied to this account until you sign out or it expires.</p></div>
            </div>
          </section>

          <section className="rounded-[16px] border border-violet-100 bg-violet-50/60 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-white text-violet-600"><CalendarRange className="h-4 w-4" /></span>
              <div><h2 className="text-sm font-semibold text-brand-navy">Platform subscription</h2><p className="mt-1 text-xs leading-relaxed text-brand-body/60">Your saved payment option will support future CDS Space platform plans and one-time service payments.</p></div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ConnectedAccountsSection() {
  const [connections, setConnections] = useState<AuthConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const result = parameters.get("connection") || "";
    const detail = parameters.get("detail") || "";
    if (result.endsWith("_connected")) {
      const provider = result.startsWith("linkedin") ? "LinkedIn" : "Google";
      setNotice({ type: "success", text: `${provider} is now connected to this active user ID.` });
    } else if (result.endsWith("_failed") || result === "session_failed") {
      setNotice({ type: "error", text: detail || "The sign-in account could not be connected. Please try again." });
    }
    if (result) {
      parameters.delete("connection");
      parameters.delete("detail");
      const remaining = parameters.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${remaining ? `?${remaining}` : ""}`);
    }

    (async () => {
      try {
        const response = await fetch("/api/client/account/connections", { credentials: "include", cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Connected accounts could not be loaded.");
        setConnections(Array.isArray(payload.connections) ? payload.connections : []);
      } catch (error) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : "Connected accounts could not be loaded." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const connected = new Map(connections.map((connection) => [connection.provider, connection]));
  return (
    <section className="rounded-[16px] border border-brand-stroke/70 bg-white p-5 shadow-[0_10px_40px_rgba(15,40,90,0.05)] sm:p-6">
      <SectionHeading
        icon={Link2}
        title="Connected sign-in accounts"
        description="Connect Google and LinkedIn so either sign-in opens this same active user ID."
      />
      {loading ? (
        <div className="grid min-h-28 place-items-center rounded-[14px] bg-slate-50"><Loader2 className="h-5 w-5 animate-spin text-brand-blue" /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["google", "linkedin"] as const).map((provider) => {
            const connection = connected.get(provider);
            const label = provider === "google" ? "Google" : "LinkedIn";
            return (
              <div key={provider} className="rounded-[14px] border border-brand-stroke/60 bg-slate-50/60 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white shadow-sm">
                    <ProviderIcon provider={provider} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-brand-navy">{label}</h3>
                      {connection && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"><Check className="h-3 w-3" />Connected</span>}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-brand-body/60">{connection?.email || `No ${label} account connected`}</p>
                  </div>
                </div>
                {connection ? (
                  <p className="mt-4 rounded-[10px] border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-[11px] leading-5 text-emerald-800">Continue with {label} will sign in to this active user ID.</p>
                ) : (
                  <a
                    href={`/api/client/account/connections/${provider}/connect?next=${encodeURIComponent("/dashboard/settings")}`}
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[#0A4FE8] px-3 text-[12px] font-semibold text-white transition hover:bg-[#083EC0]"
                  >
                    <Link2 className="h-3.5 w-3.5" />Connect {label}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-[11px] leading-5 text-brand-body/55">Until accounts are connected, each social identity may open its own separate CDS Space user entry. Connecting a provider changes which active user ID that sign-in opens; it does not merge documents, orders, invoices or other data from a separate entry.</p>
      <NoticeBox notice={notice} />
    </section>
  );
}

function ProviderIcon({ provider }: { provider: AuthProvider }) {
  if (provider === "google") {
    return <Image src="/auth/Signup/flat-color-icons_google.svg" alt="" width={22} height={22} aria-hidden="true" />;
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path fill="#fff" d="M6.94 8.58H4.5V19h2.44V8.58zM5.72 7.44a1.42 1.42 0 1 0 0-2.84 1.42 1.42 0 0 0 0 2.84zM19.5 19h-2.44v-5.09c0-1.28-.46-2.15-1.6-2.15-.87 0-1.39.59-1.62 1.16-.08.2-.1.49-.1.77V19h-2.44s.03-9.19 0-10.42h2.44v1.48c.32-.5.9-1.21 2.2-1.21 1.6 0 2.8 1.05 2.8 3.3V19z" />
    </svg>
  );
}

interface CurrencyRequest {
  id: string;
  currentCurrency: string;
  requestedCurrency: string;
  reason: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  requestedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

// The billing currency is set once during account setup. A client who chose the wrong
// one asks for a change here; an admin approves it (admin/clients/list) and it switches.
function BillingCurrencySection() {
  const { account, updateAccount } = useClientAccount();
  const [request, setRequest] = useState<CurrencyRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [allowance, setAllowance] = useState({ used: 0, limit: 2 });
  const current = account.billingCurrency;
  const pending = request?.status === "pending";
  const left = Math.max(0, allowance.limit - allowance.used);
  const keepAllowance = (payload: { used?: number; limit?: number }) => {
    if (typeof payload.used === "number" && typeof payload.limit === "number") setAllowance({ used: payload.used, limit: payload.limit });
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/client/account/currency-request", { credentials: "include", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        setRequest(payload.request || null);
        keepAllowance(payload);
        // An approved change since this page loaded: show the new currency straight away.
        const latest = normalizeClientBillingCurrency(payload.currency);
        if (latest && latest !== current) updateAccount({ billingCurrency: latest });
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoaded(true));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/client/account/currency-request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedCurrency: requested, reason }),
      });
      const payload = await response.json().catch(() => ({}));
      keepAllowance(payload);
      if (!response.ok) throw new Error(payload.error || "Could not send your request.");
      setRequest(payload.request);
      setOpen(false);
      setReason("");
      setRequested("");
      setNotice({ type: "success", text: "Request sent. We'll notify you once an admin reviews it." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not send your request." });
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!(await appConfirm({ title: "Withdraw request?", message: "Your billing currency stays as it is.", confirmLabel: "Withdraw request", destructive: true }))) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/client/account/currency-request", { method: "DELETE", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not withdraw your request.");
      setRequest(payload.request || null);
      keepAllowance(payload);
      setNotice({ type: "info", text: "Request withdrawn." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not withdraw your request." });
    } finally {
      setBusy(false);
    }
  }

  const currentOption = CLIENT_BILLING_CURRENCY_OPTIONS.find((option) => option.code === current);
  const choices = CLIENT_BILLING_CURRENCY_OPTIONS.filter((option) => option.code !== current);

  return (
    <section className="rounded-[16px] border border-brand-stroke/70 bg-white p-5 shadow-[0_10px_40px_rgba(15,40,90,0.05)] sm:p-6">
      <SectionHeading icon={Banknote} title="Billing currency" description="Set during account setup. New quotations, invoices and plan prices use it; existing invoices keep their currency." />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 min-w-11 place-items-center rounded-[12px] bg-blue-50 px-2 text-sm font-semibold text-brand-blue">{current}</span>
          <div>
            <p className="text-[15px] font-semibold text-brand-navy">{currentOption?.name || current}</p>
            <p className="text-xs text-brand-body/55">Your account billing currency</p>
          </div>
        </div>
        {loaded && !pending && !open && left > 0 && (
          <button type="button" onClick={() => { setOpen(true); setNotice(null); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-brand-stroke px-4 text-sm font-semibold text-brand-blue hover:bg-blue-50/60">
            <ArrowRightLeft className="h-4 w-4" />Request a change
          </button>
        )}
      </div>

      {pending && request && (
        <div className="mt-5 flex flex-col gap-3 rounded-[12px] border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-start">
          <Clock3 className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-brand-navy">Change to {request.requestedCurrency} is waiting for review</p>
            <p className="mt-1 break-words text-xs leading-relaxed text-brand-body/65">&ldquo;{request.reason}&rdquo;</p>
            <p className="mt-1 text-[11px] text-brand-body/50">Sent {new Date(request.requestedAt).toLocaleDateString()}</p>
          </div>
          <button type="button" disabled={busy} onClick={() => void withdraw()} className="h-9 shrink-0 rounded-[10px] border border-amber-200 bg-white px-3 text-xs font-semibold text-brand-body disabled:opacity-50">Withdraw</button>
        </div>
      )}

      {!pending && request?.status === "declined" && (
        <p className="mt-5 rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-brand-body/70">
          Your last request to change to {request.requestedCurrency} was declined{request.reviewNote ? `: ${request.reviewNote}` : "."}
        </p>
      )}

      {loaded && !pending && (
        <p className="mt-4 text-xs text-brand-body/55">
          {left > 0
            ? `You can request a currency change ${left === 1 ? "1 more time" : `${left} times`}.`
            : `You have used all ${allowance.limit} currency change requests for this account. Contact CDS Space support if you still need help.`}
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="mt-5 space-y-4 rounded-[12px] border border-brand-stroke/70 bg-brand-bg/30 p-4">
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold text-brand-body">New billing currency</span>
            <select required value={requested} onChange={(event) => setRequested(event.target.value)} className="h-12 w-full rounded-[12px] border border-brand-stroke bg-white px-4 text-[15px] text-brand-navy outline-none transition focus:border-brand-blue/40 focus:ring-4 focus:ring-blue-100/70">
              <option value="" disabled>Choose a currency</option>
              {choices.map((option) => <option key={option.code} value={option.code}>{option.name} ({option.code})</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold text-brand-body">Reason</span>
            <textarea required minLength={10} maxLength={1000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: I chose GBP by mistake; my company is registered in Nigeria." className="w-full rounded-[12px] border border-brand-stroke bg-white px-4 py-3 text-[14px] text-brand-navy outline-none transition focus:border-brand-blue/40 focus:ring-4 focus:ring-blue-100/70" />
          </label>
          <p className="text-[11px] leading-5 text-brand-body/55">An admin reviews every request. Once approved, your account switches to the new currency. Each account can send {allowance.limit} requests in total{left === 1 ? "; this is your last one" : ""}.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" disabled={busy || !requested || reason.trim().length < 10} className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Sending..." : "Send request"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-[12px] border border-brand-stroke px-5 text-sm font-semibold text-brand-body">Cancel</button>
          </div>
        </form>
      )}

      <NoticeBox notice={notice} />
    </section>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setNotice({ type: "error", text: "The new passwords do not match." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/client/account/password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not change your password.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice({ type: "success", text: "Password changed successfully." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not change your password." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={changePassword} className="rounded-[16px] border border-brand-stroke/70 bg-white p-5 shadow-[0_10px_40px_rgba(15,40,90,0.05)] sm:p-6">
      <SectionHeading icon={KeyRound} title="Password and security" description="Confirm your current password before choosing a new one." />
      <div className="grid gap-5 sm:grid-cols-2">
        <PasswordField label="Current password" value={currentPassword} onChange={setCurrentPassword} visible={showPasswords} autoComplete="current-password" />
        <div className="hidden sm:block" />
        <PasswordField label="New password" value={newPassword} onChange={setNewPassword} visible={showPasswords} autoComplete="new-password" />
        <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} visible={showPasswords} autoComplete="new-password" />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-5 text-brand-body/55">Use 10+ characters with uppercase, lowercase and a number.</p>
        <button type="button" onClick={() => setShowPasswords((value) => !value)} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-blue">
          {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showPasswords ? "Hide passwords" : "Show passwords"}
        </button>
      </div>
      <NoticeBox notice={notice} />
      <button type="submit" disabled={saving || !currentPassword || !newPassword || !confirmPassword} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-brand-navy px-5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {saving ? "Changing password..." : "Change password"}
      </button>
    </form>
  );
}

function PaymentMethodSection() {
  const [data, setData] = useState<PaymentMethodResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/client/payments/method", { credentials: "include", cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load payment options.");
      setData(payload);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not load payment options." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const state = new URLSearchParams(window.location.search).get("payment");
    if (state === "success") setNotice({ type: "success", text: "Your payment method was verified and saved." });
    if (state === "failed") setNotice({ type: "error", text: "The payment method could not be verified. Please try again." });
    if (state === "cancelled") setNotice({ type: "info", text: "Card setup was cancelled. No payment method was changed." });
    if (state) window.history.replaceState({}, "", window.location.pathname);
    void load();
  }, []);

  async function startSetup() {
    setStarting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/client/payments/paystack/initialize", {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not start secure card setup.");
      window.location.assign(payload.authorization_url);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not start secure card setup." });
      setStarting(false);
    }
  }

  async function remove() {
    if (!(await appConfirm("Remove this saved payment method? Existing invoices and transaction records will remain available."))) return;
    const response = await fetch("/api/client/payments/method", { method: "DELETE", credentials: "include" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice({ type: "error", text: payload.error || "Could not remove the payment method." });
      return;
    }
    setData((current) => current ? { ...current, method: null } : current);
    setNotice({ type: "success", text: "Payment method removed." });
  }

  const method = data?.method;
  const setupAmount = data?.setup ? formatMinorAmount(data.setup.amount, data.setup.currency) : null;
  const cardName = method ? (method.card_brand || method.card_type || "Card") : "";
  const currencyUnsupported = Boolean(data?.configured && !data.available);

  return (
    <section className="rounded-[16px] border border-brand-stroke/70 bg-white p-5 shadow-[0_10px_40px_rgba(15,40,90,0.05)] sm:p-6">
      <SectionHeading icon={WalletCards} title="Payment options" description="Use one secure payment method for one-time services and future platform subscriptions." />

      {loading ? (
        <div className="grid min-h-28 place-items-center rounded-[14px] bg-slate-50"><Loader2 className="h-5 w-5 animate-spin text-brand-blue" /></div>
      ) : method ? (
        <div className="rounded-[16px] border border-blue-100 bg-[#0A4FE8] p-5 text-white shadow-[0_12px_28px_rgba(7,91,229,0.18)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold text-white/65">Default payment option</p>
              <p className="mt-4 text-lg font-bold capitalize">{cardName} •••• {method.last4 || "••••"}</p>
              <p className="mt-1 text-xs text-white/70">{method.bank || "Paystack card"}{method.exp_month && method.exp_year ? ` · Expires ${method.exp_month}/${method.exp_year}` : ""}</p>
            </div>
            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold">Verified</span>
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <p className="text-[11px] text-white/65">Paystack · {method.payment_email}</p>
            <div className="flex gap-2">
              {data?.available && <button type="button" onClick={() => { void startSetup(); }} disabled={starting} className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-white px-3 text-[12px] font-bold text-[#075BE5] disabled:opacity-60">
                {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} Update card
              </button>}
              <button type="button" onClick={() => { void remove(); }} className="grid h-9 w-9 place-items-center rounded-[10px] border border-white/20 bg-white/10 text-white" aria-label="Remove payment method"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      ) : currencyUnsupported ? (
        <div className="flex flex-col gap-4 rounded-[14px] border border-dashed border-slate-200 bg-slate-50/70 p-5 sm:flex-row sm:items-center">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-white text-brand-body/50 shadow-sm"><CreditCard className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-brand-navy">Card payments are not available for {data?.currency}</h3>
            <p className="mt-1 text-xs leading-5 text-brand-body/60">You can pay invoices and subscriptions by bank transfer from the invoice page.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-[14px] border border-dashed border-blue-200 bg-blue-50/40 p-5 sm:flex-row sm:items-center">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-white text-brand-blue shadow-sm"><CreditCard className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-brand-navy">No payment method saved</h3>
            <p className="mt-1 text-xs leading-5 text-brand-body/60">Add a card through Paystack’s hosted checkout. CDS Space never receives or stores your card number or CVV.</p>
          </div>
          <button type="button" onClick={() => { void startSetup(); }} disabled={starting || !data?.configured} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] bg-brand-blue px-4 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Add payment method
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border border-brand-stroke/60 bg-slate-50/70 p-4"><p className="text-[12px] font-bold text-brand-navy">One-time services</p><p className="mt-1 text-[11px] leading-5 text-brand-body/55">Use the verified option for approved settings, invoices and project payments.</p></div>
        <div className="rounded-[12px] border border-brand-stroke/60 bg-slate-50/70 p-4"><p className="text-[12px] font-bold text-brand-navy">Platform subscription</p><p className="mt-1 text-[11px] leading-5 text-brand-body/55">Ready for recurring CDS Space plans once subscription pricing is activated.</p></div>
      </div>

      {!data?.configured && !loading && (
        <p className="mt-4 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-medium text-amber-700">The secure payment gateway is being activated. Card setup will become available once it is connected.</p>
      )}
      {data?.configured && setupAmount && (
        <p className="mt-4 text-[11px] leading-5 text-brand-body/55">Paystack may apply a {setupAmount} card-verification charge during setup. The verified authorization can then be used only for payments you approve or an active subscription.</p>
      )}
      <NoticeBox notice={notice} />
    </section>
  );
}

function CloseAccountSection({ accountEmail }: { accountEmail: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [expiresIn, setExpiresIn] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const emailMatches = email.trim().toLowerCase() === accountEmail.trim().toLowerCase();
  const canRequestCode = emailMatches && reason.trim().length >= 10 && !closing;
  const canClose = canRequestCode && otpSent && otp.length === 6 && expiresIn > 0;

  useEffect(() => {
    if (!otpSent || (expiresIn <= 0 && resendIn <= 0)) return;
    const timer = window.setInterval(() => {
      setExpiresIn((value) => Math.max(0, value - 1));
      setResendIn((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresIn, otpSent, resendIn]);

  function reset() {
    if (closing) return;
    setOpen(false);
    setEmail("");
    setReason("");
    setOtp("");
    setOtpSent(false);
    setExpiresIn(0);
    setResendIn(0);
    setNotice(null);
  }

  async function requestClosureCode() {
    if (!canRequestCode) return;
    setClosing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/client/account/close", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), reason: reason.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not send the verification code.");
      setOtpSent(true);
      setOtp("");
      setExpiresIn(Number(payload.expiresInSeconds || 900));
      setResendIn(Number(payload.resendInSeconds || 60));
      setNotice({ type: "success", text: `A six-digit closure code was sent to ${accountEmail}.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not send the verification code." });
    } finally {
      setClosing(false);
    }
  }

  async function closeAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!otpSent) {
      await requestClosureCode();
      return;
    }
    if (!canClose) return;
    if (!(await appConfirm("Permanently close this CDS Space business account? Your verified code will be consumed and you will be signed out."))) return;

    setClosing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/client/account/close", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not close your account.");
      window.location.replace("/login?account=closed");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not close your account." });
      setClosing(false);
    }
  }

  const expiryMinutes = Math.floor(expiresIn / 60);
  const expirySeconds = String(expiresIn % 60).padStart(2, "0");

  return (
    <section className="rounded-[16px] border border-red-200 bg-white p-5 shadow-[0_10px_40px_rgba(15,40,90,0.05)] sm:p-6">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-700">
        <AlertTriangle className="h-3.5 w-3.5" /> Danger zone
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-brand-navy">Close business account</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-brand-body/65">
              Closing your account removes dashboard access and signs you out. Previous invoices, payments, completed orders,
              deliveries and audit records will still be retained for accounting, legal and transaction-history purposes.
            </p>
          </div>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 shrink-0 items-center justify-center rounded-[11px] border border-red-200 px-4 text-[13px] font-semibold text-red-600 transition hover:bg-red-50">
            Close account
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={closeAccount} className="mt-5 rounded-[14px] border border-red-100 bg-red-50/40 p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-brand-navy">Confirm account closure</h3>
              <p className="mt-1 text-xs leading-5 text-brand-body/60">Tell us why you are leaving and confirm the request with the one-time code sent to your account email.</p>
            </div>
            <button type="button" onClick={reset} disabled={closing} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-brand-body/60 hover:bg-white" aria-label="Cancel account closure">
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold text-brand-body">Why do you want to close your account?</span>
            <textarea required disabled={otpSent} minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Share what led to this decision..." className="min-h-28 w-full resize-y rounded-[12px] border border-brand-stroke bg-white px-4 py-3 text-[14px] text-brand-navy outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100/70 disabled:cursor-not-allowed disabled:bg-slate-50" />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-[13px] font-semibold text-brand-body">Account email</span>
            <input required disabled={otpSent} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={accountEmail} className="h-12 w-full rounded-[12px] border border-brand-stroke bg-white px-4 text-[14px] text-brand-navy outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100/70 disabled:cursor-not-allowed disabled:bg-slate-50" />
            {email && !emailMatches && <span className="mt-2 block text-[11px] text-red-600">This must match {accountEmail}.</span>}
          </label>

          {otpSent && (
            <div className="mt-4 rounded-[12px] border border-red-100 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1">
                  <span className="mb-2 block text-[13px] font-semibold text-brand-body">Email verification code</span>
                  <input
                    required
                    name="account-closure-otp"
                    data-autosave="off"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="h-12 w-full rounded-[12px] border border-brand-stroke bg-white px-4 text-[18px] font-semibold tracking-[0.28em] text-brand-navy outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100/70"
                  />
                </label>
                <button type="button" disabled={closing || resendIn > 0} onClick={requestClosureCode} className="h-11 rounded-[11px] border border-brand-stroke bg-white px-4 text-[12px] font-semibold text-brand-navy disabled:opacity-45">
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-brand-body/60">
                <span>{expiresIn > 0 ? `Code expires in ${expiryMinutes}:${expirySeconds}` : "Code expired. Request a new one."}</span>
                <button type="button" disabled={closing} onClick={() => { setOtpSent(false); setOtp(""); setNotice(null); }} className="font-semibold text-brand-blue hover:underline">Edit details</button>
              </div>
            </div>
          )}

          <NoticeBox notice={notice} />
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={reset} disabled={closing} className="h-11 rounded-[11px] border border-brand-stroke bg-white px-4 text-[13px] font-semibold text-brand-navy disabled:opacity-50">Keep account open</button>
            <button type="submit" disabled={otpSent ? !canClose : !canRequestCode} className="inline-flex h-11 items-center justify-center gap-2 rounded-[11px] bg-red-600 px-4 text-[13px] font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45">
              {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : otpSent ? <Trash2 className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
              {closing ? (otpSent ? "Closing account..." : "Sending code...") : otpSent ? "Permanently close account" : "Send verification code"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function SectionHeading({ icon: Icon, title, description }: { icon: typeof UserRound; title: string; description?: string }) {
  return <div className="mb-6 flex items-start gap-2 border-b border-brand-stroke/20 pb-4"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" /><div><h2 className="font-semibold text-brand-navy">{title}</h2>{description && <p className="mt-1 text-xs text-brand-body/55">{description}</p>}</div></div>;
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const styles = notice.type === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : notice.type === "error"
      ? "border-red-200 bg-red-50 text-red-600"
      : "border-blue-200 bg-blue-50 text-blue-700";
  return <p role="status" className={`mt-5 rounded-[12px] border px-4 py-3 text-sm font-medium ${styles}`}>{notice.text}</p>;
}

function Field({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  return <label className="block"><span className="mb-2 block text-[13px] font-semibold text-brand-body">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} className="h-12 w-full rounded-[12px] border border-brand-stroke bg-brand-bg/40 px-4 text-[15px] text-brand-navy outline-none transition focus:border-brand-blue/40 focus:bg-white focus:ring-4 focus:ring-blue-100/70" /></label>;
}

function PasswordField({ label, value, onChange, visible, autoComplete }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; autoComplete: string }) {
  return <label className="block"><span className="mb-2 block text-[13px] font-semibold text-brand-body">{label}</span><input required type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} className="h-12 w-full rounded-[12px] border border-brand-stroke bg-brand-bg/40 px-4 text-[15px] text-brand-navy outline-none transition focus:border-brand-blue/40 focus:bg-white focus:ring-4 focus:ring-blue-100/70" /></label>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <label className="block"><span className="mb-2 block text-[13px] font-semibold text-brand-body">{label}</span><span className="flex h-12 w-full items-center gap-2 rounded-[12px] border border-brand-stroke bg-slate-50 px-4 text-[14px] text-brand-body"><Check className="h-4 w-4 text-emerald-500" />{value}</span></label>;
}

function formatMinorAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount / 100);
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`;
  }
}
