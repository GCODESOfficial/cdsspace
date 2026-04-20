import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CurrencyCode = "usd" | "ngn" | "rwf";

function getCountryFromHeaders(request: NextRequest) {
  const headerCandidates = [
    request.headers.get("x-vercel-ip-country"),
    request.headers.get("cf-ipcountry"),
    request.headers.get("cloudfront-viewer-country"),
    request.headers.get("x-country-code"),
  ];

  const country = headerCandidates.find((value) => typeof value === "string" && value.trim().length > 0);
  if (country) return country.trim().toUpperCase();

  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const localeRegionMatch = acceptLanguage.match(/-[A-Z]{2}\b/);
  return localeRegionMatch ? localeRegionMatch[0].slice(1).toUpperCase() : null;
}

function getCurrencyForCountry(country: string | null): CurrencyCode {
  switch (country) {
    case "NG":
      return "ngn";
    case "RW":
      return "rwf";
    default:
      return "usd";
  }
}

export async function GET(request: NextRequest) {
  const country = getCountryFromHeaders(request);
  const currency = getCurrencyForCountry(country);

  return NextResponse.json({
    country,
    currency,
  });
}
