"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  BadgeDollarSign,
  Box,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  MessageCircle,
  Plus,
  Save,
  ToggleLeft,
  ToggleRight,
  Upload,
} from "lucide-react";
import {
  BANNER_CURRENCIES,
  convertBannerPricesFromUsd,
  type BannerCommerceConfig,
  type BannerDesignService,
  type BannerPrices,
  type BannerProduct,
} from "@/lib/banner-commerce";
import { appAlert } from "@/lib/app-notify";

const INPUT = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-[12px] text-[#0D1B39] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

interface BannerEditRequest {
  id: string;
  display_id: string;
  title: string;
  banner_status: string;
  client_name: string | null;
  company_name: string | null;
  client_email: string | null;
  message: string;
  status: "submitted" | "in_review" | "resolved" | "declined";
  admin_note: string | null;
  requested_at: string;
}

type BannerProductionConfig = Pick<BannerCommerceConfig, "products" | "designServices">;

function PriceInputs({ prices, onChange }: { prices: BannerPrices; onChange: (prices: BannerPrices) => void }) {
  const changePrice = (currency: (typeof BANNER_CURRENCIES)[number], rawValue: string) => {
    const amount = Math.max(0, Number(rawValue) || 0);
    onChange(currency === "USD"
      ? convertBannerPricesFromUsd(amount, prices)
      : { ...prices, [currency]: amount });
  };

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {BANNER_CURRENCIES.map((currency) => (
          <label key={currency} className="relative">
            <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold ${currency === "USD" ? "text-[#0A4FE8]" : "text-slate-400"}`}>{currency}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={Number(prices?.[currency]) || ""}
              onChange={(event) => changePrice(currency, event.target.value)}
              placeholder="Not set"
              className={`${INPUT} w-full pl-12 ${currency === "USD" ? "border-blue-200 bg-blue-50/40" : ""}`}
            />
          </label>
        ))}
      </div>
      <p className="text-[10px] leading-4 text-slate-400">USD is the base price. Changing it refreshes the equivalent amounts in every currency; any converted field can still be edited manually.</p>
    </div>
  );
}

function ActiveToggle({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!active)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      {active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}{active ? "Available" : "Hidden"}
    </button>
  );
}

function SectionTitle({ icon: Icon, title, description, action }: { icon: React.ElementType; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between lg:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><Icon className="h-5 w-5" /></span>
        <div><h2 className="text-[16px] font-bold text-[#0D1B39]">{title}</h2><p className="mt-1 max-w-3xl text-[12px] leading-5 text-slate-500">{description}</p></div>
      </div>
      {action}
    </div>
  );
}

export default function BannerCommerceAdminPage() {
  const [config, setConfig] = useState<BannerProductionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editRequests, setEditRequests] = useState<BannerEditRequest[]>([]);
  const [reviewingRequest, setReviewingRequest] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [uploadingPresentation, setUploadingPresentation] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/banner-config", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load settings.");
        return payload as BannerProductionConfig;
      })
      .then(setConfig)
      .catch((error) => void appAlert(error.message))
      .finally(() => setLoading(false));
  }, []);

  const loadEditRequests = () => fetch("/api/admin/banner-config/edit-requests", { cache: "no-store" })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load edit requests.");
      setEditRequests(payload.requests || []);
    })
    .catch((error) => void appAlert(error instanceof Error ? error.message : "Could not load edit requests."));

  useEffect(() => { void loadEditRequests(); }, []);

  const reviewEditRequest = async (requestId: string, status: "in_review" | "resolved" | "declined") => {
    setReviewingRequest(requestId);
    try {
      const response = await fetch("/api/admin/banner-config/edit-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId, status, adminNote: reviewNotes[requestId] || "" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not update the edit request.");
      await loadEditRequests();
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not update the edit request.");
    } finally {
      setReviewingRequest(null);
    }
  };

  const updateProduct = (id: string, patch: Partial<BannerProduct>) => setConfig((current) => current ? ({ ...current, products: current.products.map((item) => item.id === id ? { ...item, ...patch } : item) }) : current);
  const updateService = (id: string, patch: Partial<BannerDesignService>) => setConfig((current) => current ? ({ ...current, designServices: current.designServices.map((item) => item.id === id ? { ...item, ...patch } : item) }) : current);

  const addProduct = () => setConfig((current) => current ? ({ ...current, products: [...current.products, {
    id: crypto.randomUUID(), code: `banner-${Date.now()}`, name: "New banner size", description: "", width_cm: 85, height_cm: 200,
    quality: "Standard", environment: "Indoor", standard_prices: {}, premium_prices: {}, prices: {}, active: false, sort_order: current.products.length * 10 + 10,
  }] }) : current);
  const readyProducts = useMemo(() => config?.products.filter((product) => product.active && [product.standard_prices, product.premium_prices].some((prices) => Number(prices.NGN) > 0 && Number(prices.USD) > 0)).length || 0, [config]);

  const uploadPresentation = async (productId: string, file: File | null) => {
    if (!file) return;
    setUploadingPresentation(productId);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("catalogue", "banners");
      const response = await fetch("/api/admin/catalog-presentation", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not upload the presentation image.");
      updateProduct(productId, { presentation_image_path: payload.path, presentation_image_name: payload.fileName, presentation_image_url: payload.previewUrl });
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not upload the presentation image.");
    } finally {
      setUploadingPresentation(null);
    }
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/banner-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save settings.");
      setConfig(payload);
      await appAlert("Banner catalogue and design pricing saved.");
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) return <div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;

  const designService = config.designServices[0];
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-[24px] bg-[#0A4FE8] p-6 text-white shadow-[0_20px_60px_rgba(10,79,232,0.22)] lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-[11px] font-semibold text-blue-200">Sales Hub · Banner Commerce</p><h1 className="mt-2 text-[28px] font-bold tracking-tight lg:text-[36px]">Configure, price and invoice banners</h1><p className="mt-2 max-w-3xl text-[13px] leading-6 text-blue-100">Control the banner catalogue, production materials, and design fees. Countries, offers, pickup points, and delivery rules now live in Sales settings for use across every client order.</p></div>
          <button onClick={save} disabled={saving} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-[13px] font-bold text-[#0A4FE8] shadow-lg transition hover:bg-blue-50 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save changes</button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { icon: Box, label: "Banner sizes", value: config.products.filter((item) => item.active).length, note: `${readyProducts} priced in NGN + USD` },
          { icon: CircleDollarSign, label: "Currencies", value: BANNER_CURRENCIES.length, note: BANNER_CURRENCIES.join(" · ") },
          { icon: MessageCircle, label: "Open edit requests", value: editRequests.filter((item) => item.status === "submitted" || item.status === "in_review").length, note: "Client changes awaiting action" },
        ].map((item) => <div key={item.label} className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><item.icon className="h-5 w-5" /></span><p className="mt-4 text-[25px] font-bold text-[#0D1B39]">{item.value}</p><p className="text-[12px] font-semibold text-[#0D1B39]">{item.label}</p><p className="mt-1 text-[10px] text-slate-400">{item.note}</p></div>)}
      </div>

      <section id="edit-requests" className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <SectionTitle icon={MessageCircle} title="Client edit requests" description="Review changes requested from a submitted banner order. Every response is added to the client-visible activity log." />
        <div className="divide-y divide-slate-100">
          {editRequests.length === 0 && <div className="p-8 text-center text-[12px] text-slate-400">No client edit requests yet.</div>}
          {editRequests.map((request) => (
            <article key={request.id} className="space-y-4 p-5 lg:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold text-[#0A4FE8]">{request.display_id}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${request.status === "resolved" ? "bg-emerald-50 text-emerald-700" : request.status === "declined" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>{request.status.replaceAll("_", " ")}</span></div><h3 className="mt-1 text-[15px] font-bold text-[#0D1B39]">{request.title}</h3><p className="mt-1 text-[11px] text-slate-500">{request.company_name || request.client_name || request.client_email || "Client"} · {new Date(request.requested_at).toLocaleString()}</p></div>
              </div>
              <blockquote className="rounded-[14px] border-s-4 border-blue-200 bg-blue-50/50 px-4 py-3 text-[12px] leading-6 text-slate-700">{request.message}</blockquote>
              {request.status !== "resolved" && request.status !== "declined" && <><textarea value={reviewNotes[request.id] ?? request.admin_note ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Add a friendly update the client will see in their activity log…" className="min-h-20 w-full resize-none rounded-[12px] border border-slate-200 px-3 py-2 text-[12px] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={reviewingRequest === request.id} onClick={() => void reviewEditRequest(request.id, "in_review")} className="h-10 rounded-[10px] border border-amber-200 px-4 text-[11px] font-semibold text-amber-700 hover:bg-amber-50">Mark in review</button><button type="button" disabled={reviewingRequest === request.id} onClick={() => void reviewEditRequest(request.id, "declined")} className="h-10 rounded-[10px] border border-red-200 px-4 text-[11px] font-semibold text-red-600 hover:bg-red-50">Close request</button><button type="button" disabled={reviewingRequest === request.id} onClick={() => void reviewEditRequest(request.id, "resolved")} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#0A4FE8] px-4 text-[11px] font-semibold text-white disabled:opacity-50">{reviewingRequest === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Mark completed</button></div></>}
              {(request.status === "resolved" || request.status === "declined") && request.admin_note && <p className="rounded-[12px] bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-600">{request.admin_note}</p>}
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <SectionTitle icon={Box} title="Banner catalogue and production prices" description="Set Standard and Premium production prices together for every size. Enter the USD amount first to calculate the other currencies, then adjust any converted value when a local price needs an override." action={<button onClick={addProduct} className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 px-4 text-[11px] font-bold text-[#0A4FE8] hover:bg-blue-50"><Plus className="h-4 w-4" />Add size</button>} />
        <div className="divide-y divide-slate-100">
          {config.products.map((product) => (
            <article key={product.id} className="space-y-4 p-5 lg:p-6">
              <div className="grid gap-3 lg:grid-cols-[1.4fr_.7fr_.7fr_.8fr_auto]">
                <input value={product.name} onChange={(event) => updateProduct(product.id, { name: event.target.value })} className={INPUT} aria-label="Product name" />
                <label className="flex items-center gap-2"><input type="number" min="1" value={product.width_cm} onChange={(event) => updateProduct(product.id, { width_cm: Number(event.target.value) })} className={`${INPUT} min-w-0 w-full`} /><span className="text-[10px] text-slate-400">cm W</span></label>
                <label className="flex items-center gap-2"><input type="number" min="1" value={product.height_cm} onChange={(event) => updateProduct(product.id, { height_cm: Number(event.target.value) })} className={`${INPUT} min-w-0 w-full`} /><span className="text-[10px] text-slate-400">cm H</span></label>
                <select value={product.environment} onChange={(event) => updateProduct(product.id, { environment: event.target.value })} className={INPUT}><option>Indoor</option><option>Outdoor</option><option>Indoor / Outdoor</option></select>
                <ActiveToggle active={product.active} onChange={(active) => updateProduct(product.id, { active })} />
              </div>
              <input value={product.description || ""} onChange={(event) => updateProduct(product.id, { description: event.target.value })} placeholder="Short client-facing description" className={`${INPUT} w-full`} />
              <div className="flex flex-col gap-4 rounded-[18px] border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center">
                <div className="relative h-28 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white sm:w-36">
                  {product.presentation_image_url ? <Image src={product.presentation_image_url} alt={`${product.name} presentation`} fill unoptimized className="object-contain p-2" /> : <div className="grid h-full place-items-center px-4 text-center text-[10px] text-slate-400">No product presentation yet</div>}
                </div>
                <div className="min-w-0 flex-1"><h3 className="text-[12px] font-bold text-[#0D1B39]">Product presentation</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">Shown while the client chooses a banner and whenever CDS Space is creating the artwork.</p><label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-[11px] font-semibold text-[#0A4FE8] hover:bg-blue-50"><Upload className="h-3.5 w-3.5" />{uploadingPresentation === product.id ? "Uploading…" : product.presentation_image_path ? "Replace visual" : "Upload visual"}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploadingPresentation === product.id} onChange={(event) => void uploadPresentation(product.id, event.target.files?.[0] || null)} /></label></div>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-3 rounded-[18px] border border-blue-100 bg-blue-50/30 p-4">
                  <div><h3 className="text-[12px] font-bold text-[#0D1B39]">Standard material</h3><p className="mt-1 text-[10px] text-slate-500">Everyday production material for regular indoor use.</p></div>
                  <PriceInputs prices={product.standard_prices} onChange={(standard_prices) => updateProduct(product.id, { standard_prices })} />
                </div>
                <div className="space-y-3 rounded-[18px] border border-violet-100 bg-violet-50/30 p-4">
                  <div><h3 className="text-[12px] font-bold text-[#0D1B39]">Premium material</h3><p className="mt-1 text-[10px] text-slate-500">Higher-grade material and finishing for premium presentation.</p></div>
                  <PriceInputs prices={product.premium_prices} onChange={(premium_prices) => updateProduct(product.id, { premium_prices })} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {designService && <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <SectionTitle icon={BadgeDollarSign} title="Create a new design" description="This one-time design fee is added only when a client asks CDS Space to create the banner artwork from their content, brand assets, and references." />
        <div className="space-y-4 p-5 lg:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center"><input value={designService.name} onChange={(event) => updateService(designService.id, { name: event.target.value })} className={`${INPUT} flex-1`} /><ActiveToggle active={designService.active} onChange={(active) => updateService(designService.id, { active })} /></div>
          <textarea value={designService.description || ""} onChange={(event) => updateService(designService.id, { description: event.target.value })} className="min-h-20 w-full rounded-xl border border-slate-200 p-3 text-[12px] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
          <PriceInputs prices={designService.prices} onChange={(prices) => updateService(designService.id, { prices })} />
        </div>
      </section>}

      <div className="flex justify-end pb-8"><button onClick={save} disabled={saving} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#0A4FE8] px-6 text-[13px] font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-[#083FC0] disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Apply to Banner Studio</button></div>
    </div>
  );
}
