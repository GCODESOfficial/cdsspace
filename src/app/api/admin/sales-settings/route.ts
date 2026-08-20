import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { normalizeSalesPrices } from "@/lib/sales-settings";

export const dynamic = "force-dynamic";

async function readSettings() {
  const db = financeDb();
  const [countries, deliveryZones, pickupLocations, offerCodes, bankAccounts] = await Promise.all([
    db.from("banner_countries").select("*").order("sort_order").order("country_name"),
    db.from("banner_delivery_zones").select("*").order("priority", { ascending: false }).order("name"),
    db.from("banner_pickup_locations").select("*").order("sort_order").order("name"),
    db.from("banner_discount_codes").select("*").order("created_at", { ascending: false }),
    db.from("sales_bank_accounts").select("*").order("currency").order("sort_order").order("bank_name"),
  ]);
  const error = countries.error || deliveryZones.error || pickupLocations.error || offerCodes.error || bankAccounts.error;
  if (error) throw error;
  return {
    countries: countries.data || [],
    deliveryZones: deliveryZones.data || [],
    pickupLocations: pickupLocations.data || [],
    offerCodes: offerCodes.data || [],
    bankAccounts: bankAccounts.data || [],
  };
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function validUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "clients.sales_settings.view");
  if (denied) return denied;
  try {
    return NextResponse.json(await readSettings());
  } catch (error) {
    console.error("[sales-settings] load failed", error);
    return NextResponse.json({ error: "Could not load Sales settings." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "clients.sales_settings.edit");
  if (denied) return denied;

  try {
    const body = await request.json();
    const countries = Array.isArray(body.countries) ? body.countries : [];
    const deliveryZones = Array.isArray(body.deliveryZones) ? body.deliveryZones : [];
    const pickupLocations = Array.isArray(body.pickupLocations) ? body.pickupLocations : [];
    const offerCodes = Array.isArray(body.offerCodes) ? body.offerCodes : [];
    const bankAccounts = Array.isArray(body.bankAccounts) ? body.bankAccounts : [];
    const db = financeDb();
    const now = new Date().toISOString();

    if (!countries.length) {
      return NextResponse.json({ error: "At least one delivery country is required." }, { status: 400 });
    }

    const countryRows = countries.map((country: Record<string, unknown>, index: number) => ({
      ...(validUuid(country.id) ? { id: country.id } : {}),
      country_code: cleanText(country.country_code).toUpperCase().slice(0, 3),
      country_name: cleanText(country.country_name, "Country"),
      is_domestic: country.is_domestic === true,
      delivery_mode: country.delivery_mode === "fixed" ? "fixed" : "quoted",
      prices: normalizeSalesPrices(country.prices),
      active: country.active !== false,
      sort_order: Number(country.sort_order) || index * 10,
      updated_at: now,
    }));
    if (countryRows.some((country: { country_code: string }) => !country.country_code)) {
      return NextResponse.json({ error: "Every country needs a country code." }, { status: 400 });
    }

    const { data: savedCountries, error: countryError } = await db
      .from("banner_countries")
      .upsert(countryRows, { onConflict: "country_code" })
      .select("id, country_code");
    if (countryError) throw countryError;
    const countryIdByCode = new Map((savedCountries || []).map((country: { id: string; country_code: string }) => [country.country_code, country.id]));

    const resolveCountryId = (sourceId: unknown) => {
      if (validUuid(sourceId)) return sourceId as string;
      const linkedCountry = countries.find((country: Record<string, unknown>) => country.id === sourceId);
      return countryIdByCode.get(cleanText(linkedCountry?.country_code).toUpperCase());
    };
    const zoneRows = deliveryZones.map((zone: Record<string, unknown>) => ({
      ...(validUuid(zone.id) ? { id: zone.id } : {}),
      country_id: resolveCountryId(zone.country_id),
      name: cleanText(zone.name, "Delivery zone"),
      region: cleanText(zone.region) || null,
      city: cleanText(zone.city) || null,
      delivery_mode: zone.delivery_mode === "quoted" ? "quoted" : "fixed",
      prices: normalizeSalesPrices(zone.prices),
      active: zone.active !== false,
      priority: Number(zone.priority) || 0,
      updated_at: now,
    }));
    const pickupRows = pickupLocations.map((location: Record<string, unknown>, index: number) => ({
      ...(validUuid(location.id) ? { id: location.id } : {}),
      country_id: resolveCountryId(location.country_id),
      name: cleanText(location.name, "Pickup location"),
      address_line: cleanText(location.address_line),
      region: cleanText(location.region) || null,
      city: cleanText(location.city) || null,
      instructions: cleanText(location.instructions) || null,
      active: location.active !== false,
      sort_order: Number(location.sort_order) || index * 10,
      updated_at: now,
    }));
    const offerRows = offerCodes.map((offer: Record<string, unknown>) => ({
      ...(validUuid(offer.id) ? { id: offer.id } : {}),
      code: cleanText(offer.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32),
      description: cleanText(offer.description) || null,
      percentage: Math.min(100, Math.max(0.01, Number(offer.percentage) || 0)),
      active: offer.active !== false,
      starts_at: cleanText(offer.starts_at) || null,
      expires_at: cleanText(offer.expires_at) || null,
      updated_at: now,
    }));
    const allowedCurrencies = new Set(["NGN", "RWF", "USD", "GBP", "EUR", "CNY", "AED"]);
    const bankRows = bankAccounts.map((account: Record<string, unknown>, index: number) => ({
      ...(validUuid(account.id) ? { id: account.id } : {}),
      currency: cleanText(account.currency).toUpperCase(),
      country_code: cleanText(account.country_code).toUpperCase().slice(0, 3) || null,
      bank_name: cleanText(account.bank_name),
      account_name: cleanText(account.account_name),
      account_number: cleanText(account.account_number) || null,
      iban: cleanText(account.iban).toUpperCase().replace(/\s+/g, "") || null,
      swift_bic: cleanText(account.swift_bic).toUpperCase().replace(/\s+/g, "") || null,
      routing_number: cleanText(account.routing_number) || null,
      bank_address: cleanText(account.bank_address) || null,
      instructions: cleanText(account.instructions) || null,
      logo_url: cleanText(account.logo_url) || null,
      active: account.active !== false,
      sort_order: Number(account.sort_order) || index * 10,
      updated_at: now,
    }));

    if (zoneRows.some((zone: { country_id?: unknown }) => !validUuid(zone.country_id))) {
      return NextResponse.json({ error: "Every delivery zone must belong to a saved country." }, { status: 400 });
    }
    if (pickupRows.some((location: { country_id?: unknown }) => !validUuid(location.country_id))) {
      return NextResponse.json({ error: "Every pickup location must belong to a saved country." }, { status: 400 });
    }
    if (pickupRows.some((location: { name: string; address_line: string }) => !location.name || !location.address_line)) {
      return NextResponse.json({ error: "Every pickup location needs a name and full address." }, { status: 400 });
    }
    if (offerRows.some((offer: { code: string }) => offer.code.length < 3)) {
      return NextResponse.json({ error: "Every Special Offer Code needs at least three letters or numbers." }, { status: 400 });
    }
    if (bankRows.some((account: { currency: string; bank_name: string; account_name: string; account_number: string | null; iban: string | null }) =>
      !allowedCurrencies.has(account.currency) || !account.bank_name || !account.account_name || (!account.account_number && !account.iban))) {
      return NextResponse.json({ error: "Every bank account needs a supported currency, bank, account name, and an account number or IBAN." }, { status: 400 });
    }

    const writes = await Promise.all([
      zoneRows.length ? db.from("banner_delivery_zones").upsert(zoneRows) : Promise.resolve({ error: null }),
      pickupRows.length ? db.from("banner_pickup_locations").upsert(pickupRows) : Promise.resolve({ error: null }),
      offerRows.length ? db.from("banner_discount_codes").upsert(offerRows, { onConflict: "code" }) : Promise.resolve({ error: null }),
      bankRows.length ? db.from("sales_bank_accounts").upsert(bankRows) : Promise.resolve({ error: null }),
    ]);
    const writeError = writes.find((result) => result.error)?.error;
    if (writeError) throw writeError;

    const [storedCountries, storedZones, storedPickups, storedOffers, storedBanks] = await Promise.all([
      db.from("banner_countries").select("country_code"),
      db.from("banner_delivery_zones").select("id"),
      db.from("banner_pickup_locations").select("id"),
      db.from("banner_discount_codes").select("code"),
      db.from("sales_bank_accounts").select("id"),
    ]);
    const readError = storedCountries.error || storedZones.error || storedPickups.error || storedOffers.error || storedBanks.error;
    if (readError) throw readError;

    const keepCountries = new Set(countryRows.map((country: { country_code: string }) => country.country_code));
    const keepZones = new Set(zoneRows.map((zone: { id?: string }) => zone.id).filter(Boolean));
    const keepPickups = new Set(pickupRows.map((location: { id?: string }) => location.id).filter(Boolean));
    const keepOffers = new Set(offerRows.map((offer: { code: string }) => offer.code));
    const keepBanks = new Set(bankRows.map((account: { id?: string }) => account.id).filter(Boolean));
    const removedCountries = (storedCountries.data || []).map((item: { country_code: string }) => item.country_code).filter((code: string) => !keepCountries.has(code));
    const removedZones = (storedZones.data || []).map((item: { id: string }) => item.id).filter((id: string) => !keepZones.has(id));
    const removedPickups = (storedPickups.data || []).map((item: { id: string }) => item.id).filter((id: string) => !keepPickups.has(id));
    const removedOffers = (storedOffers.data || []).map((item: { code: string }) => item.code).filter((code: string) => !keepOffers.has(code));
    const removedBanks = (storedBanks.data || []).map((item: { id: string }) => item.id).filter((id: string) => !keepBanks.has(id));

    const deactivations = await Promise.all([
      removedCountries.length ? db.from("banner_countries").update({ active: false, updated_at: now }).in("country_code", removedCountries) : Promise.resolve({ error: null }),
      removedZones.length ? db.from("banner_delivery_zones").update({ active: false, updated_at: now }).in("id", removedZones) : Promise.resolve({ error: null }),
      removedPickups.length ? db.from("banner_pickup_locations").update({ active: false, updated_at: now }).in("id", removedPickups) : Promise.resolve({ error: null }),
      removedOffers.length ? db.from("banner_discount_codes").update({ active: false, updated_at: now }).in("code", removedOffers) : Promise.resolve({ error: null }),
      removedBanks.length ? db.from("sales_bank_accounts").update({ active: false, updated_at: now }).in("id", removedBanks) : Promise.resolve({ error: null }),
    ]);
    const deactivateError = deactivations.find((result) => result.error)?.error;
    if (deactivateError) throw deactivateError;

    await logActivity({
      action: "sales.settings.update",
      page: "clients/sales-settings",
      resource_type: "sales_settings",
      resource_label: `${countryRows.length} countries · ${zoneRows.length} delivery zones · ${pickupRows.length} pickup locations · ${offerRows.length} Special Offer Codes · ${bankRows.length} bank accounts`,
      metadata: { countries: countryRows.length, delivery_zones: zoneRows.length, pickup_locations: pickupRows.length, offer_codes: offerRows.length, bank_accounts: bankRows.length },
    });

    return NextResponse.json({ ok: true, ...(await readSettings()) });
  } catch (error) {
    console.error("[sales-settings] save failed", error);
    return NextResponse.json({ error: "Could not save Sales settings." }, { status: 500 });
  }
}
