"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { INDUSTRY_CATEGORIES } from "@/lib/industry-categories";
import { Loader2, Save, DollarSign } from "lucide-react";

const PLANS = ["startup", "scaleup", "supreme"] as const;
const PLAN_LABELS: Record<string, string> = { startup: "Startup", scaleup: "Scaleup", supreme: "Supreme" };
const CURRENCIES = ["usd", "ngn", "rwf"] as const;
const CURRENCY_SYMBOLS: Record<string, string> = { usd: "$", ngn: "₦", rwf: "RF" };

interface PricingRow {
  id?: string;
  plan: string;
  industry: string;
  price_usd: number;
  price_ngn: number;
  price_rwf: number;
}

export default function PricingPage() {
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState(INDUSTRY_CATEGORIES[0]);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  useEffect(() => { fetchPricing(); }, []);

  async function fetchPricing() {
    setIsFetching(true);
    const { data } = await supabase.from("plan_pricing").select("*");
    setPricing(data || []);
    setIsFetching(false);
  }

  function getPrice(plan: string, industry: string): PricingRow {
    const existing = pricing.find(p => p.plan === plan && p.industry === industry);
    return existing || { plan, industry, price_usd: 0, price_ngn: 0, price_rwf: 0 };
  }

  function updatePrice(plan: string, industry: string, currency: string, value: number) {
    setDirty(true);
    setPricing(prev => {
      const idx = prev.findIndex(p => p.plan === plan && p.industry === industry);
      const key = `price_${currency}` as keyof PricingRow;
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], [key]: value };
        return updated;
      }
      return [...prev, { plan, industry, price_usd: 0, price_ngn: 0, price_rwf: 0, [key]: value }];
    });
  }

  async function handleSave() {
    setIsSaving(true);
    const rows = PLANS.flatMap(plan =>
      INDUSTRY_CATEGORIES.map(industry => {
        const p = getPrice(plan, industry);
        return { plan, industry, price_usd: p.price_usd, price_ngn: p.price_ngn, price_rwf: p.price_rwf };
      })
    );

    const { error } = await supabase.from("plan_pricing").upsert(rows, { onConflict: "plan,industry" });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "All pricing updated" });
      setDirty(false);
      fetchPricing();
    }
    setIsSaving(false);
  }

  if (isFetching) {
    return <div className="p-8 flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;
  }

  return (
    <div className="p-8 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Management</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Plan Pricing</h1>
          <p className="text-gray-400 text-[13px] mt-1">Set subscription prices per industry in USD, NGN, and RWF</p>
        </div>
        <button onClick={handleSave} disabled={isSaving || !dirty}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-40">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? "Saving..." : "Save All"}
        </button>
      </div>

      {/* Industry Tabs */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {INDUSTRY_CATEGORIES.map(ind => (
          <button key={ind} onClick={() => setSelectedIndustry(ind)}
            className={`px-4 py-2 rounded-xl text-[13px] font-medium transition ${
              selectedIndustry === ind
                ? "bg-[#0A4FE8] text-white shadow-md"
                : "bg-white text-gray-500 border border-gray-200 hover:border-blue-200 hover:text-[#0A4FE8]"
            }`}>
            {ind}
          </button>
        ))}
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-3 gap-6">
        {PLANS.map(plan => {
          const row = getPrice(plan, selectedIndustry);
          return (
            <div key={plan} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                  plan === "startup" ? "bg-blue-50" : plan === "scaleup" ? "bg-[#0A4FE8] text-white" : "bg-amber-50"
                }`}>
                  {plan === "startup" ? "⚡" : plan === "scaleup" ? "🚀" : "👑"}
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[#0D1B39]">{PLAN_LABELS[plan]}</h3>
                  <p className="text-[11px] text-gray-400">{selectedIndustry}</p>
                </div>
              </div>

              <div className="space-y-4">
                {CURRENCIES.map(currency => (
                  <div key={currency}>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
                      <span className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600">
                        {CURRENCY_SYMBOLS[currency]}
                      </span>
                      {currency.toUpperCase()} / month
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row[`price_${currency}` as keyof PricingRow] || ""}
                      onChange={(e) => updatePrice(plan, selectedIndustry, currency, parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 font-mono placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Overview */}
      <div className="mt-10 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-[#0D1B39]">All Industries Overview (USD)</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2.5 px-6 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Industry</th>
              {PLANS.map(p => (
                <th key={p} className="text-right py-2.5 px-6 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{PLAN_LABELS[p]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INDUSTRY_CATEGORIES.map(ind => (
              <tr key={ind} className={`border-b border-gray-50 hover:bg-blue-50/30 transition ${ind === selectedIndustry ? "bg-blue-50/40" : ""}`}>
                <td className="py-3 px-6 text-[13px] font-medium text-[#0D1B39]">{ind}</td>
                {PLANS.map(plan => {
                  const val = getPrice(plan, ind).price_usd;
                  return (
                    <td key={plan} className="py-3 px-6 text-right text-[13px] font-mono text-gray-600">
                      {val > 0 ? `$${val.toLocaleString()}` : <span className="text-gray-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
