import { getCountries } from "libphonenumber-js";

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
