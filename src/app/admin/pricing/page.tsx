"use client";

import { useEffect, useState } from "react";
import { Layers3, Loader2, Rocket, Save, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();

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
    const column = SUBSCRIPTION_PRICE_COLUMNS[currency] as keyof PricingRow;
    setDirty(true);
    setPricing((previous) => {
      const index = previous.findIndex((row) => row.plan === plan && row.industry === industry);
      if (index >= 0) {
        const updated = [...previous];
        updated[index] = { ...updated[index], [column]: value };
        return updated;
      }
      return [...previous, { plan, industry, ...EMPTY_PRICES, [column]: value }];
    });
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
                  <p className="text-[11px] text-gray-500">{selectedIndustry} · per {plan.billingUnit}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {CLIENT_BILLING_CURRENCIES.map((currency) => {
                  const column = SUBSCRIPTION_PRICE_COLUMNS[currency] as keyof PricingRow;
                  return (
                    <div key={currency}>
                      <label htmlFor={`${plan.id}-${currency}`} className="mb-1.5 flex items-center gap-2 text-xs font-medium text-gray-600">
                        <span className="grid h-6 min-w-6 place-items-center rounded-[6px] bg-gray-100 px-1 text-[10px] font-semibold text-gray-600">{SYMBOLS[currency]}</span>
                        {currency}
                      </label>
                      <input
                        id={`${plan.id}-${currency}`}
                        type="number"
                        min="0"
                        max="999999999"
                        step="0.01"
                        value={Number(row[column] || 0) || ""}
                        onChange={(event) => updatePrice(plan.id, selectedIndustry, currency, Number(event.target.value) || 0)}
                        placeholder="0.00"
                        className="h-11 w-full rounded-[10px] border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none transition focus:border-[#0A4FE8] focus:bg-white focus:ring-4 focus:ring-blue-100"
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-9 overflow-hidden rounded-[18px] border border-gray-200 bg-white shadow-[0_10px_32px_rgba(15,40,90,0.05)]">
        <div className="border-b border-gray-100 px-5 py-4 sm:px-6"><h2 className="text-[15px] font-semibold text-[#0D1B39]">All industries in USD</h2></div>
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
