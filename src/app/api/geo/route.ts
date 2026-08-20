import { NextRequest, NextResponse } from "next/server";
import { getCountryCallingCode } from "libphonenumber-js";

export const dynamic = "force-dynamic";

/**
 * Our own lightweight IP/geo resolver - no third-party API call. It reads the
 * country the edge/CDN already attached to the request, falling back to the
 * browser's Accept-Language region. Fast (headers only) and self-contained.
 */
function detectCountry(req: NextRequest): string | null {
  const headerCandidates = [
    req.headers.get("x-vercel-ip-country"),
    req.headers.get("cf-ipcountry"),
    req.headers.get("cloudfront-viewer-country"),
    req.headers.get("x-country-code"),
    req.headers.get("x-geo-country"),
  ];
  const fromHeader = headerCandidates.find((v) => typeof v === "string" && /^[A-Za-z]{2}$/.test(v.trim()));
  if (fromHeader) return fromHeader.trim().toUpperCase();

  const acceptLanguage = req.headers.get("accept-language") ?? "";
  const match = acceptLanguage.match(/-[A-Z]{2}\b/);
  return match ? match[0].slice(1).toUpperCase() : null;
}

// Coarse country -> app locale + currency. Extend freely.
const LOCALE_BY_COUNTRY: Record<string, string> = {
  FR: "fr", BE: "fr", CI: "fr", SN: "fr", CD: "fr", CM: "fr",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es",
  PT: "pt", BR: "pt", AO: "pt", MZ: "pt",
  DE: "de", AT: "de", CH: "de",
  SA: "ar", AE: "ar", EG: "ar", MA: "ar", DZ: "ar", QA: "ar", KW: "ar",
  CN: "zh", TW: "zh", HK: "zh", RU: "ru", BY: "ru", NL: "nl",
};
const CURRENCY_BY_COUNTRY: Record<string, string> = { NG: "NGN", RW: "RWF", GB: "GBP", AE: "AED", GH: "GHS", KE: "KES", ZA: "ZAR" };

export async function GET(req: NextRequest) {
  const country = detectCountry(req);
  let dialCode: string | null = null;
  let name: string | null = null;
  if (country) {
    try { dialCode = getCountryCallingCode(country as any); } catch { /* unsupported region */ } // eslint-disable-line @typescript-eslint/no-explicit-any
    try { name = new Intl.DisplayNames(["en"], { type: "region" }).of(country) || null; } catch { /* ignore */ }
  }
  const locale = (country && LOCALE_BY_COUNTRY[country]) || "en";
  const currency = (country && CURRENCY_BY_COUNTRY[country]) || (country && country !== "US" ? "USD" : "USD");

  return NextResponse.json({ country, name, dialCode, locale, currency });
}
