"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarRange,
  Check,
  CreditCard,
  FileText,
  Layers3,
  Loader2,
  Minus,
  Plus,
  Rocket,
  TrendingUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanDefinition,
  type SubscriptionPlanId,
} from "@/lib/subscription-plans";
import Link from "next/link";

interface PriceRow {
  plan: SubscriptionPlanId;
  industry: string;
  unit_price: number;
}

interface CatalogData {
  currency: string;
  prices: PriceRow[];
  industries: string[];
  paystack: {
    available: boolean;
    configured: boolean;
    mode: "live" | "test" | "unconfigured";
  };
}

interface PendingInvoice {
  invoice_number: string;
  public_token: string;
  total: number;
  currency: string;
  status: string;
}

const PLAN_ICONS = {
  startup: Rocket,
  scaleup: TrendingUp,
  supreme: Layers3,
} as const;

function formatPrice(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

export function SubscriptionPlanCatalog({
  pendingInvoice,
  onBack,
}: {
  pendingInvoice?: PendingInvoice | null;
  onBack?: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanDefinition | null>(null);
  const [industry, setIndustry] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"invoice" | "paystack" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadPricing() {
      try {
        const response = await fetch("/api/subscription/checkout", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load subscription pricing.");
        if (!cancelled) {
          setCatalog(data);
          setIndustry(data.industries?.[0] || "");
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load subscription pricing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPricing();
    return () => { cancelled = true; };
  }, []);

  const selectedPrice = useMemo(() => {
    if (!selectedPlan || !catalog || !industry) return 0;
    return Number(catalog.prices.find((row) => row.plan === selectedPlan.id && row.industry === industry)?.unit_price || 0);
  }, [catalog, industry, selectedPlan]);

  const total = selectedPlan?.id === "supreme" ? selectedPrice * quantity : selectedPrice;

  function startingPrice(planId: SubscriptionPlanId) {
    if (!catalog) return 0;
    const configured = catalog.prices
      .filter((row) => row.plan === planId && row.unit_price > 0)
      .map((row) => Number(row.unit_price));
    return configured.length ? Math.min(...configured) : 0;
  }

  function openPlan(plan: SubscriptionPlanDefinition) {
    setSelectedPlan(plan);
    setQuantity(1);
    setError("");
  }

  async function beginCheckout(paymentMethod: "invoice" | "paystack") {
    if (!selectedPlan || !industry || !selectedPrice) return;
    setSubmitting(paymentMethod);
    setError("");
    try {
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan.id,
          industry,
          design_quantity: selectedPlan.id === "supreme" ? quantity : 1,
          payment_method: paymentMethod,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not generate the subscription invoice.");

      if (paymentMethod === "paystack") {
        const paystackResponse = await fetch(data.paystack_endpoint, { method: "POST" });
        const paystackData = await paystackResponse.json().catch(() => ({}));
        if (!paystackResponse.ok) throw new Error(paystackData.error || "Could not open Paystack checkout.");
        window.location.assign(paystackData.authorization_url);
        return;
      }
      window.location.assign(data.invoice_url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start checkout.");
      setSubmitting(null);
    }
  }

  return (
    <div className="min-h-full w-full overflow-y-auto bg-[#F4F6FB] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-[1180px] rounded-[24px] border border-[#E3E8F4] bg-white px-5 py-8 shadow-[0_16px_50px_rgba(15,40,90,0.06)] sm:px-8 lg:px-12 lg:py-12">
        {onBack && (
          <button type="button" onClick={onBack} className="mb-7 inline-flex items-center gap-2 rounded-[10px] border border-[#E3E8F4] px-3 py-2 text-sm font-semibold text-brand-body transition hover:border-brand-blue/30 hover:text-brand-blue">
            <ArrowLeft className="h-4 w-4" /> Back to subscription
          </button>
        )}

        <div className="mx-auto max-w-[680px] text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full bg-[#0A4FE8]/8 px-4 py-2 text-sm font-semibold text-[#0A4FE8]">
            <CalendarRange className="h-4 w-4" /> Subscription plans
          </div>
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em] text-brand-navy sm:text-[42px]">Scale your design capacity</h1>
          <p className="mx-auto mt-4 max-w-[590px] text-[15px] leading-relaxed text-brand-body sm:text-[17px]">
            Choose a plan for your business. Prices come directly from the admin rate table in your account billing currency.
          </p>
        </div>

        {pendingInvoice && ["sent", "overdue"].includes(pendingInvoice.status) && (
          <div className="mx-auto mt-8 flex max-w-[760px] flex-col gap-3 rounded-[16px] border border-blue-200 bg-blue-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-navy">Invoice {pendingInvoice.invoice_number} is awaiting payment</p>
              <p className="mt-1 text-xs text-brand-body">{formatPrice(Number(pendingInvoice.total), pendingInvoice.currency)} · Your plan activates after payment is verified.</p>
            </div>
            <Link href={`/invoice/${pendingInvoice.public_token}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#0A4FE8] px-4 text-sm font-semibold text-white">
              <FileText className="h-4 w-4" /> Open invoice
            </Link>
          </div>
        )}

        {loading ? (
          <div className="grid min-h-[360px] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>
        ) : error && !catalog ? (
          <div className="mx-auto mt-10 max-w-[640px] rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3 lg:gap-6">
            {SUBSCRIPTION_PLANS.map((plan) => {
              const Icon = PLAN_ICONS[plan.id];
              const fromPrice = startingPrice(plan.id);
              return (
                <button
                  key={plan.id}
                  type="button"
                  data-testid={`subscription-plan-${plan.id}`}
                  onClick={() => openPlan(plan)}
                  className={cn(
                    "group relative flex min-h-[430px] flex-col rounded-[20px] border p-6 text-left transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(15,40,90,0.12)] focus:outline-none focus:ring-4 focus:ring-blue-100",
                    plan.popular ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-[#E3E8F4] bg-white text-brand-navy hover:border-[#0A4FE8]/35",
                  )}
                >
                  {plan.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-navy px-4 py-1 text-xs font-semibold text-white shadow-sm">Most popular</span>}
                  <span className={cn("grid h-11 w-11 place-items-center rounded-[12px]", plan.popular ? "bg-white/14 text-white" : "bg-blue-50 text-[#0A4FE8]") }>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h2 className="mt-5 text-[22px] font-semibold">{plan.name}</h2>
                  <p className={cn("mt-2 min-h-[44px] text-sm leading-relaxed", plan.popular ? "text-white/76" : "text-brand-body")}>{plan.description}</p>
                  <div className="mt-5">
                    {fromPrice > 0 ? (
                      <><span className="text-[22px] font-semibold">From {formatPrice(fromPrice, catalog!.currency)}</span><span className={cn("ml-1 text-xs", plan.popular ? "text-white/70" : "text-brand-mute")}>/{plan.billingUnit}</span></>
                    ) : (
                      <span className={cn("text-sm font-semibold", plan.popular ? "text-white/80" : "text-brand-blue")}>Admin price pending</span>
                    )}
                  </div>
                  <div className="mt-6 flex flex-1 flex-col gap-3">
                    {plan.features.map((feature) => (
                      <span key={feature} className={cn("flex items-start gap-2.5 text-[13px] leading-relaxed", plan.popular ? "text-white/90" : "text-brand-body")}>
                        <Check className={cn("mt-0.5 h-4 w-4 shrink-0", plan.popular ? "text-white" : "text-[#0A4FE8]")} /> {feature}
                      </span>
                    ))}
                  </div>
                  <span className={cn("mt-7 inline-flex h-11 items-center justify-center rounded-[10px] text-sm font-semibold", plan.popular ? "bg-white text-[#0A4FE8]" : "bg-[#0A4FE8] text-white")}>
                    View plan
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={Boolean(selectedPlan)} onOpenChange={(open) => { if (!open && !submitting) setSelectedPlan(null); }}>
        <DialogContent className="sm:max-w-[620px]">
          {selectedPlan && catalog && (
            <div className="pb-1">
              <DialogHeader>
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-blue-50 text-[#0A4FE8]">
                    {(() => { const Icon = PLAN_ICONS[selectedPlan.id]; return <Icon className="h-5 w-5" />; })()}
                  </span>
                  <div>
                    <DialogTitle>{selectedPlan.name} plan</DialogTitle>
                    <DialogDescription>{selectedPlan.description}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="mt-5 space-y-5">
                <div>
                  <label htmlFor="subscription-industry" className="mb-2 block text-sm font-semibold text-brand-navy">Business industry</label>
                  <select
                    id="subscription-industry"
                    value={industry}
                    onChange={(event) => { setIndustry(event.target.value); setError(""); }}
                    className="h-12 w-full rounded-[12px] border border-[#E3E8F4] bg-white px-4 text-sm text-brand-navy outline-none transition focus:border-[#0A4FE8] focus:ring-4 focus:ring-blue-100"
                  >
                    {catalog.industries.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </div>

                {selectedPlan.id === "supreme" && (
                  <div>
                    <label htmlFor="subscription-quantity" className="mb-2 block text-sm font-semibold text-brand-navy">Design quantity</label>
                    <p className="mb-3 text-xs leading-relaxed text-brand-body">Supreme is charged per design. Choose the exact number your business needs.</p>
                    <div className="flex items-center gap-3">
                      <button type="button" aria-label="Reduce design quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid h-11 w-11 place-items-center rounded-[10px] border border-[#E3E8F4] text-brand-navy hover:border-[#0A4FE8]/40"><Minus className="h-4 w-4" /></button>
                      <input id="subscription-quantity" type="number" min={1} max={1000} value={quantity} onChange={(event) => setQuantity(Math.min(1000, Math.max(1, Number(event.target.value) || 1)))} className="h-11 w-24 rounded-[10px] border border-[#E3E8F4] text-center text-sm font-semibold text-brand-navy outline-none focus:border-[#0A4FE8]" />
                      <button type="button" aria-label="Increase design quantity" onClick={() => setQuantity((value) => Math.min(1000, value + 1))} className="grid h-11 w-11 place-items-center rounded-[10px] border border-[#E3E8F4] text-brand-navy hover:border-[#0A4FE8]/40"><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}

                <div className="rounded-[16px] border border-[#E3E8F4] bg-[#F8FAFD] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-brand-body">{selectedPlan.id === "supreme" ? "Per-design unit price" : "Monthly plan price"}</p>
                      <p className="mt-1 text-sm font-semibold text-brand-navy">{industry || "Choose an industry"}</p>
                    </div>
                    <p className="text-right text-lg font-semibold text-brand-navy">{selectedPrice ? formatPrice(selectedPrice, catalog.currency) : "Not set"}</p>
                  </div>
                  <div className="my-4 h-px bg-[#E3E8F4]" />
                  <div className="flex items-end justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-brand-navy"><BadgeCheck className="h-4 w-4 text-[#0A4FE8]" /> Total due</div>
                    <div className="text-right"><p className="text-[24px] font-semibold text-[#0A4FE8]">{total ? formatPrice(total, catalog.currency) : "Not priced"}</p><p className="text-xs text-brand-mute">{selectedPlan.id === "supreme" ? `${quantity} design unit${quantity === 1 ? "" : "s"}` : "Monthly billing"}</p></div>
                  </div>
                </div>

                {error && <div role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                {!selectedPrice && <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">The admin must set a price for this plan and industry before checkout.</div>}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button type="button" disabled={!selectedPrice || Boolean(submitting)} onClick={() => void beginCheckout("invoice")} className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-[#0A4FE8] bg-white px-4 text-sm font-semibold text-[#0A4FE8] transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45">
                    {submitting === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Generate invoice
                  </button>
                  <button type="button" disabled={!selectedPrice || !catalog.paystack.available || Boolean(submitting)} onClick={() => void beginCheckout("paystack")} className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[#0A4FE8] px-4 text-sm font-semibold text-white transition hover:bg-[#083EC0] disabled:cursor-not-allowed disabled:opacity-45">
                    {submitting === "paystack" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Pay with Paystack
                  </button>
                </div>
                {!catalog.paystack.available && (
                  <p className="text-center text-xs leading-relaxed text-brand-mute">
                    {catalog.paystack.configured ? `Paystack is unavailable for ${catalog.currency}; generate an invoice to use the available payment options.` : "Paystack is not configured; generate an invoice to continue."}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
