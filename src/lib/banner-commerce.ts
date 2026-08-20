import { CLIENT_BILLING_CURRENCIES, type ClientBillingCurrency } from "@/lib/client-billing";
import { USD_RATES } from "@/lib/currency";

export type BannerPrices = Partial<Record<ClientBillingCurrency, number>>;
export type BannerDeliveryMode = "fixed" | "quoted";
export type BannerMaterial = "Standard" | "Premium";
export const BANNER_DIMENSION_UNITS = [
  { value: "mm", label: "Millimetres", symbol: "mm" },
  { value: "cm", label: "Centimetres", symbol: "cm" },
  { value: "m", label: "Metres", symbol: "m" },
  { value: "in", label: "Inches", symbol: "in" },
  { value: "ft", label: "Feet", symbol: "ft" },
  { value: "yd", label: "Yards", symbol: "yd" },
] as const;
export type BannerDimensionUnit = (typeof BANNER_DIMENSION_UNITS)[number]["value"];

export interface BannerProduct {
  id: string;
  code: string;
  name: string;
  description: string | null;
  width_cm: number;
  height_cm: number;
  quality: string;
  environment: string;
  standard_prices: BannerPrices;
  premium_prices: BannerPrices;
  prices?: BannerPrices;
  presentation_image_path?: string | null;
  presentation_image_name?: string | null;
  presentation_image_url?: string | null;
  active: boolean;
  sort_order: number;
}

export interface BannerDesignService {
  id: string;
  code: string;
  name: string;
  description: string | null;
  prices: BannerPrices;
  active: boolean;
}

export interface BannerCountry {
  id: string;
  country_code: string;
  country_name: string;
  is_domestic: boolean;
  delivery_mode: BannerDeliveryMode;
  prices: BannerPrices;
  active: boolean;
  sort_order: number;
}

export interface BannerDeliveryZone {
  id: string;
  country_id: string;
  name: string;
  region: string | null;
  city: string | null;
  delivery_mode: BannerDeliveryMode;
  prices: BannerPrices;
  active: boolean;
  priority: number;
}

export interface BannerPickupLocation {
  id: string;
  country_id: string;
  name: string;
  address_line: string;
  region: string | null;
  city: string | null;
  instructions: string | null;
  active: boolean;
  sort_order: number;
}

export interface BannerDiscountCode {
  id: string;
  code: string;
  description: string | null;
  percentage: number;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
}

export interface BannerCommerceConfig {
  products: BannerProduct[];
  designServices: BannerDesignService[];
  countries: BannerCountry[];
  deliveryZones: BannerDeliveryZone[];
  pickupLocations: BannerPickupLocation[];
  discountCodes?: BannerDiscountCode[];
  currency?: ClientBillingCurrency;
}

export const BANNER_CURRENCIES = [...CLIENT_BILLING_CURRENCIES];

export function normalizeBannerPrices(value: unknown): BannerPrices {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(
    BANNER_CURRENCIES.map((currency) => [currency, Math.max(0, Number(source[currency]) || 0)]),
  ) as BannerPrices;
}

export function bannerPrice(prices: BannerPrices | null | undefined, currency: ClientBillingCurrency) {
  return Math.max(0, Number(prices?.[currency]) || 0);
}

export function bannerMaterialPrices(product: BannerProduct, material: BannerMaterial) {
  return material === "Premium" ? product.premium_prices : product.standard_prices;
}

export function bannerMaterialPrice(
  product: BannerProduct,
  material: BannerMaterial,
  currency: ClientBillingCurrency,
) {
  return bannerPrice(bannerMaterialPrices(product, material), currency);
}

export function convertBannerPricesFromUsd(usdAmount: number, current: BannerPrices = {}) {
  const usd = Math.max(0, Number(usdAmount) || 0);
  if (usd <= 0) return { ...current, USD: 0 };

  return Object.fromEntries(BANNER_CURRENCIES.map((currency) => {
    const converted = usd * (USD_RATES[currency] || 1);
    return [currency, Math.round(converted * 100) / 100];
  })) as BannerPrices;
}

export function hasConfiguredBannerPrice(prices: BannerPrices | null | undefined, currency: ClientBillingCurrency) {
  return bannerPrice(prices, currency) > 0;
}

function sameLocation(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

export function selectBannerDeliveryZone(
  zones: BannerDeliveryZone[],
  countryId: string,
  region: string,
  city: string,
) {
  return zones
    .filter((zone) => zone.active && zone.country_id === countryId)
    .map((zone) => ({
      zone,
      score: (zone.city && sameLocation(zone.city, city) ? 100 : zone.city ? -1000 : 0)
        + (zone.region && sameLocation(zone.region, region) ? 20 : zone.region ? -1000 : 0)
        + Number(zone.priority || 0),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.zone || null;
}

export function bannerSizeLabel(product: Pick<BannerProduct, "width_cm" | "height_cm">) {
  return `${Number(product.width_cm)}cm × ${Number(product.height_cm)}cm`;
}

function formatBannerMeasurement(value: number) {
  return Number(value.toFixed(2)).toString();
}

export function bannerSizeInchesLabel(product: Pick<BannerProduct, "width_cm" | "height_cm">) {
  const widthInches = Number(product.width_cm) / 2.54;
  const heightInches = Number(product.height_cm) / 2.54;
  return `${formatBannerMeasurement(widthInches)}in × ${formatBannerMeasurement(heightInches)}in`;
}

export function bannerDescriptionWithoutDimensions(
  product: Pick<BannerProduct, "description" | "width_cm" | "height_cm">,
) {
  const description = String(product.description || "").trim();
  if (!description) return "";

  // Older product descriptions include the metric size. The card already renders
  // that value, so remove the duplicate before adding the inches equivalent.
  return description
    .replace(/^\s*\d+(?:\.\d+)?\s*cm\s*[x×]\s*\d+(?:\.\d+)?\s*cm\s*(?:[·|,;:\-]\s*)?/i, "")
    .trim();
}

export function normalizeBannerDimensionUnit(value: unknown): BannerDimensionUnit {
  return BANNER_DIMENSION_UNITS.some((unit) => unit.value === value) ? value as BannerDimensionUnit : "cm";
}

export function customBannerSizeLabel(width: number, height: number, unit: BannerDimensionUnit) {
  return `${Number(width)}${unit} × ${Number(height)}${unit}`;
}

export function bannerPickupLocationLabel(
  location: Pick<BannerPickupLocation, "name" | "address_line" | "city" | "region">,
) {
  const area = [location.address_line, location.city, location.region]
    .map((value) => String(value || "").trim())
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(", ");
  return area ? `${location.name}, ${area}` : location.name;
}
