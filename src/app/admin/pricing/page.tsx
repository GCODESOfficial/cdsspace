"use client";

import { useEffect, useState } from "react";
import { Globe2, Layers3, Loader2, Rocket, Save, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/lib/app-notify";
import { convertClientPricesFromNgn, NGN_BASE_HINT } from "@/lib/pricing/client-currency";
import { INDUSTRY_CATEGORIES } from "@/lib/industry-categories";
import {
  CLIENT_BILLING_CURRENCIES,
  CLIENT_BILLING_CURRENCY_OPTIONS,
  type ClientBillingCurrency,
} from "@/lib/client-billing";
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PRICE_COLUMNS,
  type SubscriptionPlanId,
} from "@/lib/subscription-plans";

interface PricingRow {
  id?: string;
  plan: SubscriptionPlanId;
  industry: string;
  price_usd: number;
  price_ngn: number;
  price_gbp: number;
  price_eur: number;
  price_rwf: number;
  price_cny: number;
  price_aed: number;
}

const EMPTY_PRICES = {
  price_usd: 0,
  price_ngn: 0,
  price_gbp: 0,
  price_eur: 0,
  price_rwf: 0,
  price_cny: 0,
  price_aed: 0,
};

/** Per-viewer convenience, so the mode survives a reload of this page. */
const UNIFORM_KEY = "cds.pricing.uniform";

const PLAN_ICONS = {
  startup: Rocket,
  scaleup: TrendingUp,
  supreme: Layers3,
} as const;

const SYMBOLS = Object.fromEntries(
  CLIENT_BILLING_CURRENCY_OPTIONS.map((currency) => [currency.code, currency.symbol]),
) as Record<ClientBillingCurrency, string>;

export default function PricingPage() {
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<string>(INDUSTRY_CATEGORIES[0]);
  const [dirty, setDirty] = useState(false);
  // One price list for every industry. While this is on, a figure typed into
  // any field is written to that plan and currency across every industry, so
  // the industry tabs become a preview rather than separate price lists.
  const [uniform, setUniform] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    try { setUniform(window.localStorage.getItem(UNIFORM_KEY) === "true"); } catch { /* storage can be blocked */ }
  }, []);

  async function fetchPricing() {
    setIsFetching(true);
    try {
      const response = await fetch("/api/admin/pricing", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load subscription pricing.");
      setPricing(data.pricing || []);
    } catch (reason) {
      toast({
        title: "Could not load pricing",
        description: reason instanceof Error ? reason.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
    }
  }

  useEffect(() => { void fetchPricing(); }, []);

  function getPrice(plan: SubscriptionPlanId, industry: string): PricingRow {
    const existing = pricing.find((row) => row.plan === plan && row.industry === industry);
    return existing || { plan, industry, ...EMPTY_PRICES };
  }

  function updatePrice(plan: SubscriptionPlanId, industry: string, currency: ClientBillingCurrency, value: number) {
    // Naira is the base price: typing into it recalculates every other currency
    // through the shared NGN-first formula. Any other field is a manual override
    // of one currency and leaves the rest alone.
    const patch: Partial<PricingRow> = currency === "NGN"
      ? Object.fromEntries(
          Object.entries(convertClientPricesFromNgn(value)).map(([code, amount]) => [
            SUBSCRIPTION_PRICE_COLUMNS[code as ClientBillingCurrency],
            amount,
          ]),
        )
      : { [SUBSCRIPTION_PRICE_COLUMNS[currency] as keyof PricingRow]: value };
    // In uniform mode the figure lands on every industry at once, which is the
    // whole point of the toggle: one number, priced the same everywhere.
    const targets = uniform ? INDUSTRY_CATEGORIES : [industry];
    setDirty(true);
    setPricing((previous) => {
      const updated = [...previous];
      for (const target of targets) {
        const index = updated.findIndex((row) => row.plan === plan && row.industry === target);
        if (index >= 0) updated[index] = { ...updated[index], ...patch };
        else updated.push({ plan, industry: target, ...EMPTY_PRICES, ...patch });
      }
      return updated;
    });
  }

  /**
   * Switching uniform pricing on copies the industry currently on screen over
   * every other one, because a mode that only applies to future keystrokes
   * would leave the table disagreeing with the toggle. It overwrites prices, so
   * it is confirmed first. Switching off changes nothing already entered.
   */
  async function toggleUniform(next: boolean) {
    if (next) {
      const confirmed = await appConfirm({
        title: "Use one price list everywhere?",
        message: `The ${selectedIndustry} prices will be copied to every other industry, replacing whatever is set there. From then on, every figure you type applies across all industries.`,
        confirmLabel: "Apply across all industries",
      });
      if (!confirmed) return;
      const source = SUBSCRIPTION_PLANS.map((plan) => getPrice(plan.id, selectedIndustry));
      setPricing(() =>
        SUBSCRIPTION_PLANS.flatMap((plan) => {
          const prices = source.find((row) => row.plan === plan.id) || { plan: plan.id, industry: selectedIndustry, ...EMPTY_PRICES };
          return INDUSTRY_CATEGORIES.map((industry) => ({ ...prices, id: undefined, plan: plan.id, industry }));
        }),
      );
      setDirty(true);
    }
    setUniform(next);
    try { window.localStorage.setItem(UNIFORM_KEY, String(next)); } catch { /* storage can be blocked */ }
  }

  async function handleSave() {
    setIsSaving(true);
    const rows = SUBSCRIPTION_PLANS.flatMap((plan) =>
      INDUSTRY_CATEGORIES.map((industry) => getPrice(plan.id, industry)),
    );
    try {
      const response = await fetch("/api/admin/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save subscription pricing.");
      setPricing(data.pricing || rows);
      setDirty(false);
      toast({ title: "Pricing saved", description: "Client subscription prices are now up to date." });
    } catch (reason) {
      toast({
        title: "Could not save pricing",
        description: reason instanceof Error ? reason.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isFetching) {
    return <div className="grid min-h-[420px] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>;
  }

  return (
    <div className="mx-auto max-w-[1240px] p-5 sm:p-7 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#0A4FE8]">Subscription management</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-[#0D1B39]">Plan pricing</h1>
          <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-gray-500">
            Set prices by industry and account currency. Startup and Scaleup are monthly prices; Supreme is the price for one design unit.
          </p>
        </div>
        <button type="button" onClick={() => void handleSave()} disabled={isSaving || !dirty} className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#0A4FE8] px-5 text-sm font-semibold text-white transition hover:bg-[#083EC0] disabled:cursor-not-allowed disabled:opacity-40">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? "Saving" : "Save pricing"}
        </button>
      </div>

      <div className={`mb-6 rounded-[14px] border p-4 ${uniform ? "border-[#0A4FE8] bg-blue-50/60" : "border-gray-200 bg-white"}`}>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={uniform}
            onChange={(event) => void toggleUniform(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#0A4FE8]"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-[14px] font-semibold text-[#0D1B39]">
              <Globe2 className="h-4 w-4 text-[#0A4FE8]" /> One price list across all industries
            </span>
            <span className="mt-1 block text-[12px] leading-relaxed text-gray-500">
              {uniform
                ? `Every figure you type is written to all ${INDUSTRY_CATEGORIES.length} industries at once. The tabs below preview the same prices. Save to apply.`
                : "Turn this on to price every industry the same. The industry showing now is copied everywhere, and each figure you type after that applies across the board."}
            </span>
          </span>
        </label>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {INDUSTRY_CATEGORIES.map((industry) => (
          <button key={industry} type="button" onClick={() => setSelectedIndustry(industry)} className={`rounded-[10px] border px-4 py-2 text-[13px] font-medium transition ${selectedIndustry === industry ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:text-[#0A4FE8]"}`}>
            {industry}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const row = getPrice(plan.id, selectedIndustry);
          const Icon = PLAN_ICONS[plan.id];
          return (
            <section key={plan.id} className="rounded-[18px] border border-gray-200 bg-white p-5 shadow-[0_10px_32px_rgba(15,40,90,0.05)] sm:p-6">
              <div className="mb-6 flex items-center gap-3">
                <span className={`grid h-10 w-10 place-items-center rounded-[10px] ${plan.popular ? "bg-[#0A4FE8] text-white" : "bg-blue-50 text-[#0A4FE8]"}`}><Icon className="h-5 w-5" /></span>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#0D1B39]">{plan.name}</h2>
                  <p className="text-[11px] text-gray-500">{uniform ? "All industries" : selectedIndustry} · per {plan.billingUnit}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {CLIENT_BILLING_CURRENCIES.map((currency) => {
                  const column = SUBSCRIPTION_PRICE_COLUMNS[currency] as keyof PricingRow;
                  return (
                    <div key={currency}>
                      <label htmlFor={`${plan.id}-${currency}`} className="mb-1.5 flex items-center gap-2 text-xs font-medium text-gray-600">
                        <span className={`grid h-6 min-w-6 place-items-center rounded-[6px] px-1 text-[10px] font-semibold ${currency === "NGN" ? "bg-blue-100 text-[#0A4FE8]" : "bg-gray-100 text-gray-600"}`}>{SYMBOLS[currency]}</span>
                        {currency}
                        {currency === "NGN" ? <span className="text-[10px] font-normal text-[#0A4FE8]">base</span> : <span className="text-[10px] font-normal text-gray-400">auto</span>}
                      </label>
                      <input
                        id={`${plan.id}-${currency}`}
                        type="number"
                        min="0"
                        max="999999999"
                        step="0.01"
                        value={Number(row[column] || 0) || ""}
                        onChange={(event) => updatePrice(plan.id, selectedIndustry, currency, Number(event.target.value) || 0)}
                        placeholder={currency === "NGN" ? "0.00" : "auto"}
                        className={`h-11 w-full rounded-[10px] border px-3 text-sm text-gray-800 outline-none transition focus:border-[#0A4FE8] focus:bg-white focus:ring-4 focus:ring-blue-100 ${currency === "NGN" ? "border-blue-200 bg-blue-50/40" : "border-gray-200 bg-gray-50"}`}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[10px] leading-4 text-gray-400">{NGN_BASE_HINT}</p>
            </section>
          );
        })}
      </div>

      <div className="mt-9 overflow-hidden rounded-[18px] border border-gray-200 bg-white shadow-[0_10px_32px_rgba(15,40,90,0.05)]">
        <div className="border-b border-gray-100 px-5 py-4 sm:px-6"><h2 className="text-[15px] font-semibold text-[#0D1B39]">All industries in USD</h2>{uniform && <p className="mt-0.5 text-[12px] text-gray-500">Priced the same across the board.</p>}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr className="border-b border-gray-100 bg-gray-50"><th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500">Industry</th>{SUBSCRIPTION_PLANS.map((plan) => <th key={plan.id} className="px-6 py-3 text-right text-[11px] font-semibold text-gray-500">{plan.name}{plan.id === "supreme" ? " / design" : " / month"}</th>)}</tr></thead>
            <tbody>
              {INDUSTRY_CATEGORIES.map((industry) => (
                <tr key={industry} className={`border-b border-gray-50 transition hover:bg-blue-50/30 ${industry === selectedIndustry ? "bg-blue-50/40" : ""}`}>
                  <td className="px-6 py-3 text-[13px] font-medium text-[#0D1B39]">{industry}</td>
                  {SUBSCRIPTION_PLANS.map((plan) => {
                    const value = getPrice(plan.id, industry).price_usd;
                    return <td key={plan.id} className="px-6 py-3 text-right text-[13px] text-gray-600">{value > 0 ? `$${value.toLocaleString()}` : <span className="text-gray-300">Not set</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
