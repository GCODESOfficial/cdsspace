export const SOP_SCOPE_TYPES = ["general", "department", "task"] as const;
export const SOP_STATUSES = ["draft", "published", "archived"] as const;
export const BOOK_CONDITIONS = ["new", "good", "fair", "repair"] as const;
export const BOOK_STATUSES = [
  "draft",
  "available",
  "borrowed",
  "maintenance",
  "retired",
] as const;

export const OVERNIGHT_TERMS_VERSION = "2026-09-05";
export const OVERNIGHT_TERMS = [
  "I am requesting to stay in the office voluntarily and of my own free will.",
  "I will use the facility only to work overnight or for learning and professional development.",
  "I will keep company equipment, property, and confidential information secure.",
  "I will ensure all doors and gates are properly locked and follow every office security instruction.",
  "I understand that carelessness which causes damage, loss, or a security incident will be investigated and may carry the full consequences allowed by company policy and applicable law.",
] as const;

export function overnightTermsText() {
  return OVERNIGHT_TERMS.map((term, index) => `${index + 1}. ${term}`).join(
    "\n",
  );
}

export function complianceText(value: unknown, max = 6000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function complianceUuid(value: unknown) {
  const candidate = complianceText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    candidate,
  )
    ? candidate
    : "";
}

export function complianceDate(value: unknown) {
  const candidate = complianceText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

export function complianceTime(value: unknown) {
  const candidate = complianceText(value, 12);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate) ? candidate : null;
}

export function uniqueStrings(value: unknown, max = 200) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => complianceText(item, 160)).filter(Boolean)),
  ).slice(0, max);
}

export function uniqueUuids(value: unknown, max = 500) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(complianceUuid).filter(Boolean))).slice(
    0,
    max,
  );
}
