import {
  BANNER_CURRENCIES,
  convertBannerPricesFromUsd,
  normalizeBannerPrices,
  type BannerCountry,
  type BannerDeliveryMode,
  type BannerDeliveryZone,
  type BannerDiscountCode,
  type BannerPickupLocation,
  type BannerPrices,
} from "@/lib/banner-commerce";
import type { Currency } from "@/lib/finance/types";

export type SalesPrices = BannerPrices;
export type SalesDeliveryMode = BannerDeliveryMode;
export type SalesCountry = BannerCountry;
export type SalesDeliveryZone = BannerDeliveryZone;
export type SalesPickupLocation = BannerPickupLocation;
export type SalesOfferCode = BannerDiscountCode;

export interface SalesBankAccount {
  id: string;
  currency: Currency;
  country_code: string | null;
  bank_name: string;
  account_name: string;
  account_number: string | null;
  iban: string | null;
  swift_bic: string | null;
  routing_number: string | null;
  bank_address: string | null;
  instructions: string | null;
  logo_url: string | null;
  active: boolean;
  sort_order: number;
}

export interface SalesSettingsConfig {
  countries: SalesCountry[];
  deliveryZones: SalesDeliveryZone[];
  pickupLocations: SalesPickupLocation[];
  offerCodes: SalesOfferCode[];
  bankAccounts: SalesBankAccount[];
}

export const SALES_CURRENCIES = BANNER_CURRENCIES;
export const normalizeSalesPrices = normalizeBannerPrices;
export const convertSalesPricesFromUsd = convertBannerPricesFromUsd;
