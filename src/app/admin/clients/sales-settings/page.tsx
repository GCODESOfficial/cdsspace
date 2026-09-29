"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Globe2,
  Landmark,
  Loader2,
  MapPinned,
  PenLine,
  Plus,
  Save,
  Settings2,
  Store,
  TicketPercent,
  Trash2,
  Truck,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { appAlert } from "@/lib/app-notify";
import NgnPriceInputs from "@/components/admin/NgnPriceInputs";
import type { ClientPriceSet } from "@/lib/pricing/client-currency";
import {
  SALES_CURRENCIES,
  type SalesCountry,
  type SalesBankAccount,
  type SalesDeliveryZone,
  type SalesOfferCode,
  type SalesPickupLocation,
  type SalesPrices,
  type SalesSettingsConfig,
} from "@/lib/sales-settings";

const INPUT = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-[12px] text-[#0D1B39] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

/**
 * Sales prices are typed in Naira; every other currency follows the shared
 * NGN-first formula. See src/lib/pricing/client-currency.ts.
 */
function PriceInputs({ prices, onChange }: { prices: SalesPrices; onChange: (prices: SalesPrices) => void }) {
  return (
    <NgnPriceInputs
      prices={prices as ClientPriceSet}
      onChange={(next) => onChange(next as SalesPrices)}
      inputClassName={INPUT}
      currencies={SALES_CURRENCIES}
    />
  );
}

function ActiveToggle({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) {
  return <button type="button" onClick={() => onChange(!active)} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}{active ? "Available" : "Hidden"}</button>;
}

function SectionTitle({ icon: Icon, title, description, action }: { icon: React.ElementType; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between lg:p-6"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><Icon className="h-5 w-5" /></span><div><h2 className="text-[16px] font-bold text-[#0D1B39]">{title}</h2><p className="mt-1 max-w-3xl text-[12px] leading-5 text-slate-500">{description}</p></div></div>{action}</div>;
}

export default function SalesSettingsPage() {
  const [config, setConfig] = useState<SalesSettingsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/sales-settings", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load Sales settings.");
        return payload as SalesSettingsConfig;
      })
      .then(setConfig)
      .catch((error) => void appAlert(error instanceof Error ? error.message : "Could not load Sales settings."))
      .finally(() => setLoading(false));
  }, []);

  const updateCountry = (id: string, patch: Partial<SalesCountry>) => setConfig((current) => current ? ({ ...current, countries: current.countries.map((item) => item.id === id ? { ...item, ...patch } : item) }) : current);
  const updateZone = (id: string, patch: Partial<SalesDeliveryZone>) => setConfig((current) => current ? ({ ...current, deliveryZones: current.deliveryZones.map((item) => item.id === id ? { ...item, ...patch } : item) }) : current);
  const updatePickup = (id: string, patch: Partial<SalesPickupLocation>) => setConfig((current) => current ? ({ ...current, pickupLocations: current.pickupLocations.map((item) => item.id === id ? { ...item, ...patch } : item) }) : current);
  const updateOffer = (id: string, patch: Partial<SalesOfferCode>) => setConfig((current) => current ? ({ ...current, offerCodes: current.offerCodes.map((item) => item.id === id ? { ...item, ...patch } : item) }) : current);
  const updateLetterheadPrice = (currency: string, value: number) => setConfig((current) => current
    ? ({ ...current, letterheadDesign: { ...current.letterheadDesign, [currency]: Math.max(0, value) } })
    : current);

  const updateBank = (id: string, patch: Partial<SalesBankAccount>) => setConfig((current) => current ? ({ ...current, bankAccounts: current.bankAccounts.map((item) => item.id === id ? { ...item, ...patch } : item) }) : current);

  const addCountry = () => setConfig((current) => current ? ({ ...current, countries: [...current.countries, { id: crypto.randomUUID(), country_code: "", country_name: "New country", is_domestic: false, delivery_mode: "quoted", prices: {}, active: false, sort_order: current.countries.length * 10 + 10 }] }) : current);
  const addZone = () => setConfig((current) => current?.countries.length ? ({ ...current, deliveryZones: [...current.deliveryZones, { id: crypto.randomUUID(), country_id: current.countries[0].id, name: "New delivery zone", region: "", city: "", delivery_mode: "fixed", prices: {}, active: false, priority: 0 }] }) : current);
  const addPickup = () => setConfig((current) => current?.countries.length ? ({ ...current, pickupLocations: [...current.pickupLocations, { id: crypto.randomUUID(), country_id: current.countries[0].id, name: "New pickup location", address_line: "", region: "", city: "", instructions: "", active: false, sort_order: current.pickupLocations.length * 10 + 10 }] }) : current);
  const addOffer = () => setConfig((current) => current ? ({ ...current, offerCodes: [...current.offerCodes, { id: crypto.randomUUID(), code: `OFFER${current.offerCodes.length + 1}`, description: "", percentage: 10, active: false, starts_at: null, expires_at: null }] }) : current);
  const addBank = () => setConfig((current) => current ? ({ ...current, bankAccounts: [...current.bankAccounts, { id: crypto.randomUUID(), currency: "USD", country_code: null, bank_name: "", account_name: "CDS Space Branding Agency Ltd", account_number: null, iban: null, swift_bic: null, routing_number: null, bank_address: null, instructions: null, logo_url: null, active: false, sort_order: current.bankAccounts.length * 10 + 10 }] }) : current);
  const removePickup = (id: string) => setConfig((current) => current ? ({ ...current, pickupLocations: current.pickupLocations.filter((item) => item.id !== id) }) : current);
  const removeOffer = (id: string) => setConfig((current) => current ? ({ ...current, offerCodes: current.offerCodes.filter((item) => item.id !== id) }) : current);
  const removeBank = (id: string) => setConfig((current) => current ? ({ ...current, bankAccounts: current.bankAccounts.filter((item) => item.id !== id) }) : current);

  const fixedDeliveryRules = useMemo(() => !config ? 0 : config.countries.filter((item) => item.active && item.delivery_mode === "fixed").length + config.deliveryZones.filter((item) => item.active && item.delivery_mode === "fixed").length, [config]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/sales-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save Sales settings.");
      setConfig(payload);
      await appAlert("Sales settings saved for client orders and deliveries.");
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not save Sales settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) return <div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-[24px] border border-blue-100 bg-white p-6 shadow-[0_18px_50px_rgba(15,40,90,0.08)] lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><Settings2 className="h-6 w-6" /></span><div><p className="text-[12px] font-semibold text-[#0A4FE8]">Sales Hub</p><h1 className="mt-1 text-[28px] font-bold tracking-tight text-[#0D1B39] lg:text-[36px]">Sales settings</h1><p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-500">Control Special Offer Codes, service countries, pickup points, and delivery pricing once for banners, merch, and every client order workflow.</p></div></div>
          <button onClick={save} disabled={saving} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#0A4FE8] px-6 text-[13px] font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-[#083FC0] disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save settings</button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: TicketPercent, label: "Active offers", value: config.offerCodes.filter((item) => item.active).length, note: "Available across eligible orders" },
          { icon: Globe2, label: "Available countries", value: config.countries.filter((item) => item.active).length, note: "Shared fulfilment destinations" },
          { icon: Store, label: "Pickup locations", value: config.pickupLocations.filter((item) => item.active).length, note: "Linked to available countries" },
          { icon: Truck, label: "Fixed delivery rules", value: fixedDeliveryRules, note: "Other routes are billed separately" },
        ].map((item) => <div key={item.label} className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><item.icon className="h-5 w-5" /></span><p className="mt-4 text-[25px] font-bold text-[#0D1B39]">{item.value}</p><p className="text-[12px] font-semibold text-[#0D1B39]">{item.label}</p><p className="mt-1 text-[10px] text-slate-400">{item.note}</p></div>)}
      </div>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <SectionTitle
          icon={PenLine}
          title="Letterhead design"
          description="What a client pays when they ask the CDS Space team to design their letterhead from the Create letterhead tool. The invoice is raised instantly in the currency their account is billed in."
        />
        <div className="p-5 lg:p-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {SALES_CURRENCIES.map((currency) => (
              <label key={currency} className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{currency}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={Number(config.letterheadDesign?.[currency]) || ""}
                  onChange={(event) => updateLetterheadPrice(currency, Number(event.target.value) || 0)}
                  placeholder="Not set"
                  className={`${INPUT} w-full pl-12`}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-400">
            These are set market prices, not conversions of one another, so each currency is saved exactly as entered. Naira and Rwandan francs are local-market prices; the others follow the US dollar price.
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <SectionTitle icon={TicketPercent} title="Special Offer Codes" description="Create percentage offers that can be validated server-side and used across eligible client orders before their invoice is paid." action={<button onClick={addOffer} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 px-4 text-[11px] font-semibold text-[#0A4FE8] hover:bg-blue-50"><Plus className="h-4 w-4" />Add offer</button>} />
        <div className="divide-y divide-slate-100">
          {config.offerCodes.length === 0 && <div className="p-8 text-center text-[12px] text-slate-400">No Special Offer Codes configured.</div>}
          {config.offerCodes.map((offer) => <article key={offer.id} className="space-y-3 p-5 lg:p-6"><div className="grid gap-3 md:grid-cols-[180px_130px_1fr_auto_auto]"><input value={offer.code} onChange={(event) => updateOffer(offer.id, { code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32) })} placeholder="CODE" className={`${INPUT} font-mono font-bold uppercase`} aria-label="Special Offer Code" /><label className="relative"><input type="number" min="0.01" max="100" step="0.01" value={offer.percentage} onChange={(event) => updateOffer(offer.id, { percentage: Math.min(100, Math.max(0, Number(event.target.value))) })} className={`${INPUT} w-full pe-8`} aria-label="Offer percentage" /><span className="absolute end-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">%</span></label><input value={offer.description || ""} onChange={(event) => updateOffer(offer.id, { description: event.target.value })} placeholder="Internal or client-facing note" className={INPUT} aria-label="Offer description" /><ActiveToggle active={offer.active} onChange={(active) => updateOffer(offer.id, { active })} /><button type="button" onClick={() => removeOffer(offer.id)} className="grid h-10 w-10 place-items-center rounded-xl border border-red-100 text-red-500 hover:bg-red-50" aria-label={`Remove ${offer.code}`}><Trash2 className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-[10px] font-semibold text-slate-500">Starts (optional)</span><input type="datetime-local" value={offer.starts_at ? offer.starts_at.slice(0, 16) : ""} onChange={(event) => updateOffer(offer.id, { starts_at: event.target.value ? new Date(event.target.value).toISOString() : null })} className={`${INPUT} w-full`} /></label><label className="space-y-1"><span className="text-[10px] font-semibold text-slate-500">Expires (optional)</span><input type="datetime-local" value={offer.expires_at ? offer.expires_at.slice(0, 16) : ""} onChange={(event) => updateOffer(offer.id, { expires_at: event.target.value ? new Date(event.target.value).toISOString() : null })} className={`${INPUT} w-full`} /></label></div></article>)}
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <SectionTitle
          icon={Landmark}
          title="Bank accounts"
          description="Match corporate accounts to invoice currency. NGN accounts are for Nigerian payments only. When no active corporate account exists for USD, AED, or another currency, checkout directs the client to Paystack instead."
          action={<button onClick={addBank} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 px-4 text-[11px] font-semibold text-[#0A4FE8] hover:bg-blue-50"><Plus className="h-4 w-4" />Add bank account</button>}
        />
        <div className="divide-y divide-slate-100">
          {config.bankAccounts.length === 0 && <div className="p-8 text-center text-[12px] text-slate-400">No corporate bank accounts configured. Paystack will be used for supported currencies.</div>}
          {config.bankAccounts.map((account) => (
            <article key={account.id} className="space-y-3 p-5 lg:p-6">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[120px_100px_1fr_1fr_auto_auto]">
                <select value={account.currency} onChange={(event) => updateBank(account.id, { currency: event.target.value as SalesBankAccount["currency"] })} className={INPUT} aria-label="Account currency">
                  {SALES_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
                <input value={account.country_code || ""} maxLength={3} onChange={(event) => updateBank(account.id, { country_code: event.target.value.toUpperCase() || null })} placeholder="Country" className={INPUT} aria-label="Bank country code" />
                <input value={account.bank_name} onChange={(event) => updateBank(account.id, { bank_name: event.target.value })} placeholder="Bank name" className={INPUT} />
                <input value={account.account_name} onChange={(event) => updateBank(account.id, { account_name: event.target.value })} placeholder="Corporate account name" className={INPUT} />
                <ActiveToggle active={account.active} onChange={(active) => updateBank(account.id, { active })} />
                <button type="button" onClick={() => removeBank(account.id)} className="grid h-10 w-10 place-items-center rounded-xl border border-red-100 text-red-500 hover:bg-red-50" aria-label={`Remove ${account.bank_name || account.currency} account`}><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <input value={account.account_number || ""} onChange={(event) => updateBank(account.id, { account_number: event.target.value || null })} placeholder="Account number" className={INPUT} />
                <input value={account.iban || ""} onChange={(event) => updateBank(account.id, { iban: event.target.value.toUpperCase() || null })} placeholder="IBAN (where applicable)" className={INPUT} />
                <input value={account.swift_bic || ""} onChange={(event) => updateBank(account.id, { swift_bic: event.target.value.toUpperCase() || null })} placeholder="SWIFT / BIC" className={INPUT} />
                <input value={account.routing_number || ""} onChange={(event) => updateBank(account.id, { routing_number: event.target.value || null })} placeholder="Routing number" className={INPUT} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input value={account.bank_address || ""} onChange={(event) => updateBank(account.id, { bank_address: event.target.value || null })} placeholder="Bank address (optional)" className={INPUT} />
                <input value={account.logo_url || ""} onChange={(event) => updateBank(account.id, { logo_url: event.target.value || null })} placeholder="Bank logo URL (optional)" className={INPUT} />
              </div>
              <input value={account.instructions || ""} onChange={(event) => updateBank(account.id, { instructions: event.target.value || null })} placeholder="Currency-specific transfer instructions (optional)" className={`${INPUT} w-full`} />
              {account.currency === "NGN" && <p className="rounded-xl bg-blue-50 px-4 py-3 text-[11px] leading-5 text-blue-700">This account is presented only on Nigerian Naira invoices. Foreign-currency invoices never display Nigerian account details.</p>}
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <SectionTitle icon={Store} title="Pickup locations" description="Add approved collection points once and make them available to any order delivered in the linked country." action={<button onClick={addPickup} disabled={!config.countries.length} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 px-4 text-[11px] font-semibold text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-40"><Plus className="h-4 w-4" />Add pickup location</button>} />
        <div className="divide-y divide-slate-100">
          {config.pickupLocations.length === 0 && <div className="p-8 text-center text-[12px] text-slate-400">No pickup locations configured. Direct delivery will be used.</div>}
          {config.pickupLocations.map((location) => <article key={location.id} className="space-y-3 p-5 lg:p-6"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1.1fr_1fr_1fr_auto_auto]"><select value={location.country_id} onChange={(event) => updatePickup(location.id, { country_id: event.target.value })} className={INPUT} aria-label="Pickup country">{config.countries.map((country) => <option key={country.id} value={country.id}>{country.country_name}</option>)}</select><input value={location.name} onChange={(event) => updatePickup(location.id, { name: event.target.value })} placeholder="Location name" className={INPUT} /><input value={location.region || ""} onChange={(event) => updatePickup(location.id, { region: event.target.value })} placeholder="State / region" className={INPUT} /><input value={location.city || ""} onChange={(event) => updatePickup(location.id, { city: event.target.value })} placeholder="City" className={INPUT} /><ActiveToggle active={location.active} onChange={(active) => updatePickup(location.id, { active })} /><button type="button" onClick={() => removePickup(location.id)} className="grid h-10 w-10 place-items-center rounded-xl border border-red-100 text-red-500 hover:bg-red-50" aria-label={`Remove ${location.name}`}><Trash2 className="h-4 w-4" /></button></div><input value={location.address_line} onChange={(event) => updatePickup(location.id, { address_line: event.target.value })} placeholder="Full pickup address" className={`${INPUT} w-full`} /><input value={location.instructions || ""} onChange={(event) => updatePickup(location.id, { instructions: event.target.value })} placeholder="Collection instructions, opening hours or contact details (optional)" className={`${INPUT} w-full`} /></article>)}
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <SectionTitle icon={Globe2} title="Available countries and overseas delivery" description="Set a known delivery amount or choose Bill separately when an international courier quote must be confirmed later." action={<button onClick={addCountry} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 px-4 text-[11px] font-semibold text-[#0A4FE8] hover:bg-blue-50"><Plus className="h-4 w-4" />Add country</button>} />
        <div className="divide-y divide-slate-100">
          {config.countries.map((country) => <article key={country.id} className="space-y-4 p-5 lg:p-6"><div className="grid gap-3 md:grid-cols-[100px_1fr_170px_auto]"><input value={country.country_code} maxLength={3} onChange={(event) => updateCountry(country.id, { country_code: event.target.value.toUpperCase() })} placeholder="ISO" className={INPUT} /><input value={country.country_name} onChange={(event) => updateCountry(country.id, { country_name: event.target.value })} className={INPUT} /><select value={country.delivery_mode} onChange={(event) => updateCountry(country.id, { delivery_mode: event.target.value as "fixed" | "quoted" })} className={INPUT}><option value="fixed">Fixed delivery</option><option value="quoted">Bill separately</option></select><ActiveToggle active={country.active} onChange={(active) => updateCountry(country.id, { active })} /></div>{country.delivery_mode === "fixed" ? <PriceInputs prices={country.prices} onChange={(prices) => updateCountry(country.id, { prices })} /> : <div className="rounded-xl bg-amber-50 px-4 py-3 text-[11px] font-medium text-amber-700">Delivery will be quoted and billed separately for this destination.</div>}</article>)}
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <SectionTitle icon={MapPinned} title="Nigeria and regional delivery zones" description="Add state or city overrides for any country. The most specific matching rule wins; otherwise the country-level setting is used." action={<button onClick={addZone} disabled={!config.countries.length} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 px-4 text-[11px] font-semibold text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-40"><Plus className="h-4 w-4" />Add zone</button>} />
        <div className="divide-y divide-slate-100">
          {config.deliveryZones.length === 0 && <div className="p-8 text-center text-[12px] text-slate-400">No regional delivery overrides yet. Country pricing will be used.</div>}
          {config.deliveryZones.map((zone) => <article key={zone.id} className="space-y-4 p-5 lg:p-6"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_170px_auto]"><select value={zone.country_id} onChange={(event) => updateZone(zone.id, { country_id: event.target.value })} className={INPUT}>{config.countries.map((country) => <option key={country.id} value={country.id}>{country.country_name}</option>)}</select><input value={zone.name} onChange={(event) => updateZone(zone.id, { name: event.target.value })} placeholder="Zone label" className={INPUT} /><input value={zone.region || ""} onChange={(event) => updateZone(zone.id, { region: event.target.value })} placeholder="State / region (optional)" className={INPUT} /><input value={zone.city || ""} onChange={(event) => updateZone(zone.id, { city: event.target.value })} placeholder="City / LGA (optional)" className={INPUT} /><select value={zone.delivery_mode} onChange={(event) => updateZone(zone.id, { delivery_mode: event.target.value as "fixed" | "quoted" })} className={INPUT}><option value="fixed">Fixed delivery</option><option value="quoted">Bill separately</option></select><ActiveToggle active={zone.active} onChange={(active) => updateZone(zone.id, { active })} /></div>{zone.delivery_mode === "fixed" && <PriceInputs prices={zone.prices} onChange={(prices) => updateZone(zone.id, { prices })} />}</article>)}
        </div>
      </section>

      <div className="flex justify-end pb-8"><button onClick={save} disabled={saving} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#0A4FE8] px-6 text-[13px] font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-[#083FC0] disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Apply Sales settings</button></div>
    </div>
  );
}
