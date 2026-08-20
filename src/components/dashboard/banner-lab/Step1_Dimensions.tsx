"use client";

import { motion } from "framer-motion";
import { Check, Maximize2, Ruler, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, type Currency } from "@/lib/finance/types";
import { BANNER_DIMENSION_UNITS, bannerDescriptionWithoutDimensions, bannerMaterialPrice, bannerSizeInchesLabel, bannerSizeLabel, customBannerSizeLabel, type BannerMaterial, type BannerProduct } from "@/lib/banner-commerce";
import { BannerFormData } from "./types";

interface Step1Props {
  formData: BannerFormData;
  products: BannerProduct[];
  currency: Currency;
  updateFormData: (updates: Partial<BannerFormData>) => void;
  onNext: () => void;
}

export const Step1_Dimensions = ({ formData, products, currency, updateFormData, onNext }: Step1Props) => {
  const selected = products.find((product) => product.id === formData.productId);
  const customWidth = Math.max(0, Number(formData.customWidth) || 0);
  const customHeight = Math.max(0, Number(formData.customHeight) || 0);
  const ready = formData.isCustom
    ? customWidth > 0 && customHeight > 0
    : Boolean(selected && bannerMaterialPrice(selected, formData.quality, currency) > 0);
  const materials: Array<{ value: BannerMaterial; title: string; note: string }> = [
    { value: "Standard", title: "Standard material", note: "Reliable everyday production material" },
    { value: "Premium", title: "Premium material", note: "Higher-grade material and finishing" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-7">
      <div>
        <div className="flex items-center gap-2 text-[#0A4FE8]"><Ruler className="h-4 w-4" /><p className="text-[12px] font-semibold">Product and dimensions</p></div>
        <h2 className="mt-2 text-[22px] font-bold tracking-tight text-[#0D1B39]">Choose the right banner</h2>
        <p className="mt-1 text-[12px] leading-5 text-slate-500">Every production price is controlled by Sales Hub and displayed in your account currency.</p>
      </div>

      <div className="grid gap-3">
        {products.map((product) => {
          const standardPrice = bannerMaterialPrice(product, "Standard", currency);
          const premiumPrice = bannerMaterialPrice(product, "Premium", currency);
          const availablePrices = [standardPrice, premiumPrice].filter((price) => price > 0);
          const price = availablePrices.length ? Math.min(...availablePrices) : 0;
          const priced = availablePrices.length > 0;
          const active = product.id === formData.productId;
          const description = bannerDescriptionWithoutDimensions(product);
          return (
            <button
              type="button"
              key={product.id}
              disabled={!priced}
              onClick={() => {
                const currentMaterialPrice = bannerMaterialPrice(product, formData.quality, currency);
                const quality: BannerMaterial = currentMaterialPrice > 0 ? formData.quality : standardPrice > 0 ? "Standard" : "Premium";
                updateFormData({
                  productId: product.id,
                  isCustom: false,
                  size: `${Number(product.width_cm)}x${Number(product.height_cm)}`,
                  quality,
                  environment: product.environment as BannerFormData["environment"],
                });
              }}
              className={cn(
                "group flex w-full items-center gap-4 rounded-[18px] border-2 p-4 text-left transition sm:p-5",
                active ? "border-[#0A4FE8] bg-blue-50/70 shadow-sm" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30",
                !priced && "cursor-not-allowed opacity-55",
              )}
            >
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full border-2", active ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-slate-200 text-transparent")}><Check className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-bold text-[#0D1B39]">{product.name}</span><span className="mt-1 block text-[11px] text-slate-500">{bannerSizeLabel(product)} · {bannerSizeInchesLabel(product)}{description ? ` · ${description}` : ""}</span></span>
              <span className="shrink-0 text-right"><span className="block text-[14px] font-bold text-[#0A4FE8]">{priced ? formatMoney(price, currency) : "Not priced"}</span><span className="text-[10px] text-slate-400">{priced ? "Starting from" : "Per banner"}</span></span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => updateFormData({ productId: "", isCustom: true, size: customWidth && customHeight ? customBannerSizeLabel(customWidth, customHeight, formData.dimensionUnit) : "" })}
          className={cn("group flex w-full items-center gap-4 rounded-[18px] border-2 p-4 text-left transition sm:p-5", formData.isCustom ? "border-[#0A4FE8] bg-blue-50/70 shadow-sm" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30")}
        >
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full border-2", formData.isCustom ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-slate-200 text-slate-400")}><Maximize2 className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="block text-[14px] font-bold text-[#0D1B39]">Custom banner</span><span className="mt-1 block text-[11px] text-slate-500">Choose your unit and exact width and height. CDS Space will prepare a quotation after reviewing the specification.</span></span>
          <span className="shrink-0 text-right"><span className="block text-[13px] font-bold text-[#0A4FE8]">Request quote</span><span className="text-[10px] text-slate-400">No upfront price</span></span>
        </button>
      </div>

      {formData.isCustom && <div className="space-y-4 rounded-[20px] border border-blue-100 bg-blue-50/30 p-4 sm:p-5">
        <div><h3 className="text-[13px] font-bold text-[#0D1B39]">Custom dimensions</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">Enter the finished banner size. The production team will verify material usage, finishing and delivery before pricing it.</p></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr]">
          <label className="space-y-2"><span className="text-[11px] font-bold text-[#0D1B39]">Width</span><input type="number" min="0.01" step="0.01" value={formData.customWidth} onChange={(event) => updateFormData({ customWidth: event.target.value, size: customBannerSizeLabel(Number(event.target.value) || 0, customHeight, formData.dimensionUnit) })} placeholder="e.g. 3" className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[13px] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
          <label className="space-y-2"><span className="text-[11px] font-bold text-[#0D1B39]">Height</span><input type="number" min="0.01" step="0.01" value={formData.customHeight} onChange={(event) => updateFormData({ customHeight: event.target.value, size: customBannerSizeLabel(customWidth, Number(event.target.value) || 0, formData.dimensionUnit) })} placeholder="e.g. 2" className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[13px] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
          <label className="space-y-2"><span className="text-[11px] font-bold text-[#0D1B39]">Dimension unit</span><select value={formData.dimensionUnit} onChange={(event) => { const dimensionUnit = event.target.value as BannerFormData["dimensionUnit"]; updateFormData({ dimensionUnit, size: customBannerSizeLabel(customWidth, customHeight, dimensionUnit) }); }} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[13px] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">{BANNER_DIMENSION_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label} ({unit.symbol})</option>)}</select></label>
        </div>
        <label className="block space-y-2"><span className="text-[11px] font-bold text-[#0D1B39]">Usage environment</span><select value={formData.environment} onChange={(event) => updateFormData({ environment: event.target.value as BannerFormData["environment"] })} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[13px] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option>Indoor</option><option>Outdoor</option></select></label>
      </div>}

      {(selected || formData.isCustom) && <div className="space-y-3">
        <div><h3 className="text-[13px] font-bold text-[#0D1B39]">Choose your material</h3><p className="mt-1 text-[11px] text-slate-500">{formData.isCustom ? "Your selected material will be reviewed and included in the quotation." : "Both material options are priced independently for the selected banner size."}</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {materials.map((material) => {
            const price = selected ? bannerMaterialPrice(selected, material.value, currency) : 0;
            const priced = formData.isCustom || price > 0;
            const active = formData.quality === material.value;
            return <button
              key={material.value}
              type="button"
              disabled={!priced}
              onClick={() => updateFormData({ quality: material.value })}
              className={cn("rounded-[18px] border-2 p-4 text-left transition", active ? "border-[#0A4FE8] bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200", !priced && "cursor-not-allowed opacity-50")}
            >
              <span className="flex items-start justify-between gap-3"><span><span className="block text-[13px] font-bold text-[#0D1B39]">{material.title}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{material.note}</span></span><span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border", active ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-slate-300 text-transparent")}><Check className="h-3 w-3" /></span></span>
              <span className="mt-4 block text-[14px] font-bold text-[#0A4FE8]">{formData.isCustom ? "Priced after review" : priced ? formatMoney(price, currency) : "Not priced"}</span>
            </button>;
          })}
        </div>
      </div>}

      {!formData.isCustom && !products.some((product) => bannerMaterialPrice(product, "Standard", currency) > 0 || bannerMaterialPrice(product, "Premium", currency) > 0) && (
        <div className="flex gap-3 rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-amber-800"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p className="text-[11px] leading-5">Banner pricing for {currency} is still being configured. Your account has not been charged and an order cannot be submitted until an admin approves a price.</p></div>
      )}

      <button type="button" onClick={onNext} disabled={!ready} className="h-12 w-full rounded-2xl bg-[#0A4FE8] text-[14px] font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-[#083FC0] disabled:cursor-not-allowed disabled:opacity-40">Continue to artwork</button>
    </motion.div>
  );
};
