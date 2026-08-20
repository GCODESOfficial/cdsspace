"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, PackageCheck, Store, TicketPercent, Truck } from "lucide-react";
import { getCities, getStates } from "@/lib/actions/location";
import { formatMoney, type Currency } from "@/lib/finance/types";
import {
  bannerMaterialPrice,
  bannerPickupLocationLabel,
  bannerPrice,
  selectBannerDeliveryZone,
  type BannerCountry,
  type BannerDeliveryZone,
  type BannerDesignService,
  type BannerPickupLocation,
  type BannerProduct,
} from "@/lib/banner-commerce";
import { cn } from "@/lib/utils";
import { appAlert } from "@/lib/app-notify";
import { isValidInternationalPhoneNumber } from "@/lib/phone-number";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { BannerFormData } from "./types";

interface Step3Props {
  formData: BannerFormData;
  updateFormData: (updates: Partial<BannerFormData>) => void;
  onPrev: () => void;
  onSubmit: () => void;
  currency: Currency;
  products: BannerProduct[];
  designService: BannerDesignService | null;
  countries: BannerCountry[];
  deliveryZones: BannerDeliveryZone[];
  pickupLocations: BannerPickupLocation[];
}

const INPUT = "h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[13px] text-[#0D1B39] outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100";

export const Step3_Fulfillment = ({ formData, updateFormData, onPrev, onSubmit, currency, products, designService, countries, deliveryZones, pickupLocations }: Step3Props) => {
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [discountInput, setDiscountInput] = useState(formData.discountCode || "");
  const [checkingDiscount, setCheckingDiscount] = useState(false);
  const [discountMessage, setDiscountMessage] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const selectedProduct = products.find((product) => product.id === formData.productId) || null;
  const selectedCountry = countries.find((country) => country.id === formData.shipping.countryId) || null;
  const availablePickupLocations = useMemo(() => pickupLocations.filter((location) => location.active && location.country_id === selectedCountry?.id), [pickupLocations, selectedCountry?.id]);
  const pickupAvailable = availablePickupLocations.length > 0;
  const selectedPickupLocation = availablePickupLocations.find((location) => location.id === formData.shipping.pickupLocationId) || null;

  useEffect(() => {
    if (!selectedCountry || formData.fulfillmentType !== "Pickup Station" || pickupAvailable) return;
    updateFormData({
      fulfillmentType: "Door-to-door",
      shipping: { ...formData.shipping, pickupLocationId: "", pickupStation: "" },
    });
  }, [formData.fulfillmentType, pickupAvailable, selectedCountry, updateFormData]);

  useEffect(() => {
    if (!selectedCountry) { setStates([]); return; }
    getStates(selectedCountry.country_name).then(setStates).catch(() => setStates([]));
  }, [selectedCountry]);

  useEffect(() => {
    if (!selectedCountry || !formData.shipping.state) { setCities([]); return; }
    getCities(selectedCountry.country_name, formData.shipping.state).then(setCities).catch(() => setCities([]));
  }, [selectedCountry, formData.shipping.state]);

  const matchedZone = useMemo(() => selectedCountry
    ? selectBannerDeliveryZone(deliveryZones, selectedCountry.id, formData.shipping.state, formData.shipping.city)
    : null, [deliveryZones, selectedCountry, formData.shipping.state, formData.shipping.city]);
  const pickup = formData.fulfillmentType === "Pickup Station" && pickupAvailable;
  const deliverySource = matchedZone || selectedCountry;
  const deliveryPrice = pickup ? 0 : bannerPrice(deliverySource?.prices, currency);
  const deliveryFixed = pickup || (deliverySource?.delivery_mode === "fixed" && deliveryPrice > 0);
  const quantity = Math.max(1, Number(formData.quantity) || 1);
  const production = !formData.isCustom && selectedProduct ? bannerMaterialPrice(selectedProduct, formData.quality, currency) * quantity : 0;
  const design = !formData.isCustom && formData.executionMode === "Create" && designService ? bannerPrice(designService.prices, currency) : 0;
  const beforeDiscount = formData.isCustom ? 0 : production + design + (deliveryFixed ? deliveryPrice : 0);
  const discountAmount = Math.round((beforeDiscount * Math.max(0, Math.min(100, Number(formData.discountPercentage) || 0)) / 100) * 100) / 100;
  const total = Math.max(0, beforeDiscount - discountAmount);
  const phoneValid = isValidInternationalPhoneNumber(formData.shipping.phoneNumber);

  const applyDiscount = async () => {
    const code = discountInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (!code) return void setDiscountMessage("Enter a Special Offer Code.");
    setCheckingDiscount(true);
    setDiscountMessage("");
    try {
      const response = await fetch("/api/sales/offer-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "This Special Offer Code could not be applied.");
      setDiscountInput(payload.code);
      updateFormData({ discountCode: payload.code, discountPercentage: Number(payload.percentage) || 0 });
      setDiscountMessage(`${payload.percentage}% Special Offer applied.`);
    } catch (error) {
      updateFormData({ discountCode: "", discountPercentage: 0 });
      setDiscountMessage(error instanceof Error ? error.message : "This Special Offer Code could not be applied.");
    } finally {
      setCheckingDiscount(false);
    }
  };

  const changeShipping = (patch: Partial<BannerFormData["shipping"]>) => updateFormData({ shipping: { ...formData.shipping, ...patch } });
  const submit = async () => {
    if (!selectedCountry) return void appAlert("Select a delivery country.");
    if (!formData.shipping.recipientName.trim()) return void appAlert("Add the recipient name.");
    setPhoneTouched(true);
    if (!phoneValid) return void appAlert("Enter a valid phone number and confirm the correct country code.");
    if (!pickup && (!formData.shipping.state.trim() || !formData.shipping.city.trim() || !formData.shipping.streetAddress.trim())) return void appAlert("Complete the delivery address.");
    if (pickup && !selectedPickupLocation) return void appAlert("Choose an available pickup location.");
    onSubmit();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-7">
      <div><p className="text-[12px] font-semibold text-[#0A4FE8]">Production and fulfilment</p><h2 className="mt-2 text-[22px] font-bold tracking-tight text-[#0D1B39]">Where should we send it?</h2><p className="mt-1 text-[12px] leading-5 text-slate-500">Choose a destination and review exactly what is included before the invoice is created.</p></div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { value: "Door-to-door" as const, icon: Truck, title: "Door-to-door", note: "Send directly to the supplied address" },
          ...(pickupAvailable ? [{ value: "Pickup Station" as const, icon: Store, title: "Pickup station", note: "Collect from an available CDS Space location" }] : []),
        ].map((option) => <button type="button" key={option.value} onClick={() => updateFormData({ fulfillmentType: option.value })} className={cn("flex items-center gap-3 rounded-[18px] border-2 p-4 text-left transition", formData.fulfillmentType === option.value ? "border-[#0A4FE8] bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200")}><span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-[#0A4FE8] shadow-sm"><option.icon className="h-5 w-5" /></span><span><span className="block text-[13px] font-bold text-[#0D1B39]">{option.title}</span><span className="text-[10px] text-slate-500">{option.note}</span></span></button>)}
      </div>

      {selectedCountry && !pickupAvailable && <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-900"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#0A4FE8]" /><div><p className="text-[11px] font-bold">Direct delivery applies in {selectedCountry.country_name}</p><p className="mt-1 text-[10px] leading-4 text-blue-800/80">No pickup location is configured for this country. The order will be sent directly using {selectedCountry.is_domestic ? "the available courier service" : "an international courier service"}.</p></div></div>}

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><span><span className="block text-[12px] font-bold text-[#0D1B39]">Banner quantity</span><span className="text-[10px] text-slate-500">Set in the artwork step so every print has a design.</span></span><span className="rounded-xl bg-white px-4 py-2 text-[14px] font-bold text-[#0A4FE8] shadow-sm">{quantity}</span></div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 sm:col-span-2"><span className="text-[12px] font-bold text-[#0D1B39]">Country</span><select value={formData.shipping.countryId} onChange={(event) => { const country = countries.find((item) => item.id === event.target.value); const countryHasPickup = pickupLocations.some((location) => location.active && location.country_id === event.target.value); updateFormData({ fulfillmentType: formData.fulfillmentType === "Pickup Station" && countryHasPickup ? "Pickup Station" : "Door-to-door", shipping: { ...formData.shipping, countryId: event.target.value, country: country?.country_name || "", state: "", city: "", pickupLocationId: "", pickupStation: "" } }); }} className={INPUT}><option value="">Select a country</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.country_name}</option>)}</select></label>
        {!pickup ? <>
          <label className="space-y-2"><span className="text-[12px] font-bold text-[#0D1B39]">State / region</span><input list="banner-states" value={formData.shipping.state} onChange={(event) => changeShipping({ state: event.target.value, city: "" })} placeholder="Enter state or region" className={INPUT} /><datalist id="banner-states">{states.map((state) => <option key={state} value={state} />)}</datalist></label>
          <label className="space-y-2"><span className="text-[12px] font-bold text-[#0D1B39]">City / LGA</span><input list="banner-cities" value={formData.shipping.city} onChange={(event) => changeShipping({ city: event.target.value })} placeholder="Enter city or LGA" className={INPUT} /><datalist id="banner-cities">{cities.map((city) => <option key={city} value={city} />)}</datalist></label>
          <label className="space-y-2 sm:col-span-2"><span className="text-[12px] font-bold text-[#0D1B39]">Street address</span><input value={formData.shipping.streetAddress} onChange={(event) => changeShipping({ streetAddress: event.target.value })} placeholder="Building, street and area" className={INPUT} /></label>
        </> : <label className="space-y-2 sm:col-span-2"><span className="text-[12px] font-bold text-[#0D1B39]">Preferred pickup location</span><select value={formData.shipping.pickupLocationId} onChange={(event) => { const location = availablePickupLocations.find((item) => item.id === event.target.value); changeShipping({ pickupLocationId: event.target.value, pickupStation: location ? bannerPickupLocationLabel(location) : "" }); }} className={INPUT}><option value="">Choose a pickup location</option>{availablePickupLocations.map((location) => <option key={location.id} value={location.id}>{bannerPickupLocationLabel(location)}</option>)}</select>{selectedPickupLocation?.instructions && <span className="block text-[10px] leading-4 text-slate-500">{selectedPickupLocation.instructions}</span>}</label>}
        <label className="space-y-2"><span className="text-[12px] font-bold text-[#0D1B39]">Recipient name</span><input value={formData.shipping.recipientName} onChange={(event) => changeShipping({ recipientName: event.target.value })} placeholder="Full name" className={INPUT} /></label>
        <label className="space-y-2">
          <span className="text-[12px] font-bold text-[#0D1B39]">Phone number</span>
          <PhoneInput
            value={formData.shipping.phoneNumber}
            onChange={(value) => changeShipping({ phoneNumber: value })}
            onBlur={() => setPhoneTouched(true)}
            error={phoneTouched && !phoneValid}
            className="w-full"
          />
          <span className={cn("block text-[10px] leading-4", phoneTouched && !phoneValid ? "text-red-600" : phoneValid ? "text-emerald-600" : "text-slate-500")}>
            {phoneTouched && !phoneValid
              ? "Enter a valid number. Use the country selector to change the code."
              : phoneValid
                ? "Valid international phone number."
                : "The country code is included and can be changed."}
          </span>
        </label>
        <label className="space-y-2 sm:col-span-2"><span className="text-[12px] font-bold text-[#0D1B39]">Delivery instructions (optional)</span><textarea value={formData.shipping.instructions} onChange={(event) => changeShipping({ instructions: event.target.value })} placeholder="Access notes, preferred time or contact instructions" className="min-h-20 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[13px] outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" /></label>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><PackageCheck className="h-4 w-4" /></span><div><h3 className="text-[13px] font-bold text-[#0D1B39]">{formData.isCustom ? "Quotation request" : "Invoice preview"}</h3><p className="text-[10px] text-slate-500">{formData.isCustom ? "No charge is created until the team confirms real prices." : "Final amounts are verified again on the server."}</p></div></div>
        {formData.isCustom ? <div className="space-y-4 p-4 text-[12px]">
          <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4"><ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-[#0A4FE8]" /><div><p className="font-bold text-[#0D1B39]">Quotation required before payment</p><p className="mt-1 text-[10px] leading-5 text-slate-600">This custom banner has no automatic price. CDS Space will review the dimensions, {formData.quality.toLowerCase()} material, artwork requirement and delivery destination, then convert the completed quotation into an invoice for your account.</p></div></div>
          <div className="grid gap-2 rounded-2xl bg-white p-4 text-[11px] sm:grid-cols-2">
            <span className="text-slate-500">Custom size</span><span className="font-semibold text-[#0D1B39] sm:text-right">{formData.customWidth}{formData.dimensionUnit} × {formData.customHeight}{formData.dimensionUnit}</span>
            <span className="text-slate-500">Material</span><span className="font-semibold text-[#0D1B39] sm:text-right">{formData.quality}</span>
            <span className="text-slate-500">Artwork</span><span className="font-semibold text-[#0D1B39] sm:text-right">{formData.executionMode === "Upload" ? "Client-supplied design" : "New design requested"}</span>
            <span className="text-slate-500">Quantity</span><span className="font-semibold text-[#0D1B39] sm:text-right">{quantity}</span>
            <span className="text-slate-500">Initial delivery target</span><span className="font-semibold text-[#0D1B39] sm:text-right">3 business days · editable after review</span>
            <span className="text-slate-500">Price</span><span className="font-semibold text-amber-700 sm:text-right">Pending team review</span>
          </div>
        </div> : <div className="space-y-3 p-4 text-[12px]">
          <div className="flex justify-between gap-4"><span className="text-slate-500">{selectedProduct?.name || "Banner production"} · {formData.quality} × {quantity}</span><span className="font-semibold text-[#0D1B39]">{formatMoney(production, currency)}</span></div>
          {formData.executionMode === "Create" && <div className="flex justify-between gap-4"><span className="text-slate-500">Create a new design</span><span className="font-semibold text-[#0D1B39]">{formatMoney(design, currency)}</span></div>}
          <div className="flex justify-between gap-4"><span className="text-slate-500">Delivery {matchedZone ? `· ${matchedZone.name}` : selectedCountry ? `· ${selectedCountry.country_name}` : ""}</span><span className={`font-semibold ${deliveryFixed ? "text-[#0D1B39]" : "text-amber-700"}`}>{pickup ? "Pickup" : deliveryFixed ? formatMoney(deliveryPrice, currency) : "Billed separately"}</span></div>
          <div className="flex justify-between gap-4"><span className="text-slate-500">Production duration</span><span className="font-semibold text-[#0D1B39]">3 business days</span></div>
          {!deliveryFixed && selectedCountry && <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-[10px] leading-4 text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Delivery is not included in this invoice because the final logistics cost is not yet known. It will be billed separately after confirmation.</div>}
          <div className="rounded-2xl border border-blue-100 bg-white p-3">
            <div className="flex items-center gap-2 text-[#0D1B39]"><TicketPercent className="h-4 w-4 text-[#0A4FE8]" /><span className="text-[11px] font-bold">Special Offer Code</span></div>
            <div className="mt-2 flex gap-2"><input value={discountInput} onChange={(event) => { setDiscountInput(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "")); setDiscountMessage(""); if (formData.discountCode) updateFormData({ discountCode: "", discountPercentage: 0 }); }} placeholder="Enter code" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 font-mono text-[11px] font-bold uppercase outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /><button type="button" onClick={applyDiscount} disabled={checkingDiscount || !discountInput.trim()} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#0A4FE8] px-4 text-[11px] font-bold text-white disabled:opacity-50">{checkingDiscount && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Apply</button></div>
            {discountMessage && <p className={cn("mt-2 text-[10px] font-medium", formData.discountPercentage > 0 ? "text-emerald-600" : "text-red-600")}>{discountMessage}</p>}
          </div>
          {discountAmount > 0 && <div className="flex justify-between gap-4 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700"><span>{formData.discountCode} · {formData.discountPercentage}% Special Offer</span><span className="font-bold">− {formatMoney(discountAmount, currency)}</span></div>}
          <div className="flex items-end justify-between border-t border-slate-200 pt-4"><span><span className="block text-[11px] font-medium text-slate-400">Invoice total</span><span className="text-[10px] text-slate-500">{currency} · verified again at checkout</span></span><span className="text-[22px] font-bold text-[#0A4FE8]">{formatMoney(total, currency)}</span></div>
        </div>}
      </div>

      <div className="flex gap-3"><button type="button" onClick={onPrev} disabled={formData.isSubmitting} className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white text-[13px] font-bold text-[#0D1B39] hover:bg-slate-50 disabled:opacity-40">Back</button><button type="button" onClick={submit} disabled={formData.isSubmitting || (!formData.isCustom && total <= 0)} className="inline-flex h-12 flex-[1.7] items-center justify-center gap-2 rounded-2xl bg-[#0A4FE8] text-[13px] font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-[#083FC0] disabled:opacity-40">{formData.isSubmitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <CheckCircle2 className="h-4 w-4" />}{formData.isSubmitting ? (formData.isCustom ? "Submitting request…" : "Creating invoice…") : (formData.isCustom ? "Submit for quotation" : "Create invoice for payment")}</button></div>
    </motion.div>
  );
};
