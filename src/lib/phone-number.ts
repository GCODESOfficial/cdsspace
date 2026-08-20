import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizeInternationalPhoneNumber(value: unknown): string | null {
  const phone = String(value || "").trim();
  if (!phone.startsWith("+")) return null;

  try {
    const parsed = parsePhoneNumberFromString(phone);
    return parsed?.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}

export function isValidInternationalPhoneNumber(value: unknown): boolean {
  return normalizeInternationalPhoneNumber(value) !== null;
}
