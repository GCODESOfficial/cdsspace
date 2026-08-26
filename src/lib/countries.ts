import { getCountries, getCountryCallingCode } from "libphonenumber-js";

export interface Country {
  code: string;
  name: string;
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** Every country, ISO code + English name, sorted alphabetically. Computed once. */
export const COUNTRIES: Country[] = getCountries()
  .map((code) => ({ code: code as string, name: regionNames.of(code) || (code as string) }))
  .filter((c) => c.name && c.name !== c.code)
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Countries with their international dial code, for phone-number entry.
 * Sorted by name so the picker reads the same way as COUNTRIES.
 */
export interface DialCountry extends Country {
  dial: string;
}

export const DIAL_COUNTRIES: DialCountry[] = getCountries()
  .map((code) => {
    let dial = "";
    try { dial = getCountryCallingCode(code); } catch { dial = ""; }
    return { code: code as string, name: regionNames.of(code) || (code as string), dial };
  })
  .filter((c) => c.dial && c.name && c.name !== c.code)
  .sort((a, b) => a.name.localeCompare(b.name));

export function dialCodeFor(countryCode: string): string {
  return DIAL_COUNTRIES.find((c) => c.code === countryCode)?.dial || "";
}
