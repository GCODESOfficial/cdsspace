"use client";

import { useEffect, useState } from "react";
import { Banknote, Check, CircleDollarSign, Loader2 } from "lucide-react";
import {
  CLIENT_BILLING_CURRENCIES,
  CLIENT_BILLING_CURRENCY_OPTIONS,
  type ClientBillingCurrency,
} from "@/lib/client-billing";

interface CurrencyOnboardingFormProps {
  next: string;
  userId: string;
  accountName: string;
  initialCurrency: ClientBillingCurrency | null;
}

export function CurrencyOnboardingForm({
  next,
  userId,
  accountName,
  initialCurrency,
}: CurrencyOnboardingFormProps) {
  const [currency, setCurrency] = useState<ClientBillingCurrency | null>(initialCurrency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialCurrency) return;
    let active = true;
    fetch("/api/currency", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!active || !payload) return;
        const suggested = String(payload.currency || "").toUpperCase() as ClientBillingCurrency;
        setCurrency(CLIENT_BILLING_CURRENCIES.includes(suggested) ? suggested : "USD");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [initialCurrency]);

  const save = async () => {
    if (!currency) {
      setError("Select your billing currency to continue.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/client/onboarding/currency", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingCurrency: currency, next }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save your billing currency.");
      window.location.replace(payload.next || next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your billing currency.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6" data-testid="currency-onboarding">
      <header>
        <div className="mb-4 grid size-12 place-items-center rounded-[12px] bg-blue-50 text-brand-blue">
          <CircleDollarSign className="size-6" aria-hidden="true" />
        </div>
        <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-brand-blue">Account setup</p>
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-brand-navy 2xl:text-[36px]">Choose your billing currency</h1>
        <p className="mt-2 max-w-[580px] text-[14px] font-medium leading-relaxed text-brand-body 2xl:text-[15px]">
          This choice sets the currency for new project budgets, quotations and invoices connected to your account.
        </p>
      </header>

      <section className="rounded-[16px] border border-brand-stroke bg-white p-5 shadow-[0_12px_32px_rgba(4,11,55,0.06)] sm:p-6">
        <div className="mb-5 flex items-start gap-3 rounded-[12px] bg-brand-bg px-4 py-3">
          <Banknote className="mt-0.5 size-5 shrink-0 text-brand-blue" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-brand-navy">{accountName}</p>
            <p className="mt-0.5 break-all font-mono text-[10px] text-brand-mute">{userId}</p>
          </div>
        </div>

        <div className="space-y-3" role="radiogroup" aria-label="Billing currency">
          {CLIENT_BILLING_CURRENCY_OPTIONS.map((choice) => {
            const selected = currency === choice.code;
            return (
              <button
                key={choice.code}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`currency-${choice.code.toLowerCase()}`}
                onClick={() => { setCurrency(choice.code); setError(""); }}
                className={`flex min-h-[84px] w-full items-center gap-4 rounded-[12px] border p-4 text-left transition ${
                  selected
                    ? "border-brand-blue bg-blue-50/70 ring-4 ring-blue-100/70"
                    : "border-brand-stroke bg-white hover:border-brand-blue/35 hover:bg-brand-bg/60"
                }`}
              >
                <span className={`grid size-11 shrink-0 place-items-center rounded-[8px] text-[20px] font-bold ${selected ? "bg-brand-blue text-white" : "bg-brand-bg text-brand-navy"}`}>
                  {choice.symbol}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[15px] font-semibold text-brand-navy">
                    {choice.name} <span className="text-[11px] font-bold text-brand-mute">{choice.code}</span>
                  </span>
                  <span className="mt-1 block text-[12px] leading-5 text-brand-body/65">{choice.description}</span>
                </span>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${selected ? "border-brand-blue bg-brand-blue text-white" : "border-brand-stroke text-transparent"}`}>
                  <Check className="size-4" aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-[11px] font-medium leading-5 text-brand-mute">
          CDS Space is accessible from every country, let&apos;s partner together.
        </p>
      </section>

      {error && <p role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-600">{error}</p>}

      <button
        type="button"
        data-testid="save-billing-currency"
        onClick={save}
        disabled={saving || !currency}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-[16px] bg-[#0A4FE8] text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(5,90,230,0.22)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}
        {saving ? "Saving currency..." : "Save and enter dashboard"}
      </button>
    </div>
  );
}
