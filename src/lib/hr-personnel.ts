export const HR_RECORD_TYPES = [
  "employment_contract",
  "ip_protection",
  "nda",
  "bank_statement",
  "query",
  "query_response",
  "appreciation",
  "promotion",
  "demotion",
  "leave_approval",
  "disciplinary_action",
  "performance_review",
  "other",
] as const;

export type HrRecordType = (typeof HR_RECORD_TYPES)[number];

export const HR_RECORD_TYPE_LABELS: Record<HrRecordType, string> = {
  employment_contract: "Employment contract",
  ip_protection: "IP protection contract",
  nda: "NDA contract",
  bank_statement: "Bank statement",
  query: "Query",
  query_response: "Query response",
  appreciation: "Appreciation note",
  promotion: "Promotion letter",
  demotion: "Demotion letter",
  leave_approval: "Leave approval",
  disciplinary_action: "Disciplinary action",
  performance_review: "Performance review",
  other: "Other HR record",
};

export const HR_RECORD_STATUSES = ["draft", "issued", "acknowledged", "resolved", "archived"] as const;
export type HrRecordStatus = (typeof HR_RECORD_STATUSES)[number];

export function isHrRecordType(value: unknown): value is HrRecordType {
  return HR_RECORD_TYPES.includes(String(value) as HrRecordType);
}

export function isHrRecordStatus(value: unknown): value is HrRecordStatus {
  return HR_RECORD_STATUSES.includes(String(value) as HrRecordStatus);
}

export function hrText(value: unknown, max = 5000) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function hrUuid(value: unknown) {
  const text = hrText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export function hrDateOnly(value: unknown) {
  const text = hrText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? text
    : null;
}

export function birthdayDistance(dateOfBirth: string | null | undefined, now = new Date()) {
  if (!dateOfBirth) return null;
  const parts = dateOfBirth.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [, month, day] = parts;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let next = new Date(Date.UTC(today.getUTCFullYear(), month - 1, day));
  if (next < today) next = new Date(Date.UTC(today.getUTCFullYear() + 1, month - 1, day));
  return {
    nextDate: next.toISOString().slice(0, 10),
    daysUntil: Math.round((next.getTime() - today.getTime()) / 86_400_000),
    year: next.getUTCFullYear(),
  };
}
