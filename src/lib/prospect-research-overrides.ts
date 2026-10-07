/**
 * Corrections to a company's research, made from its prospect checklist entry.
 *
 * The research on prospect_companies is replaced every time it is rechecked,
 * so an edit is never written there. It is kept on the checklist entry, one
 * value per field, and shown in place of the research for that field until it
 * is reset. Shared by the checklist, its API and the proposal preview.
 */

export type ServiceFit = { service: string; reason: string };

export const RESEARCH_TEXT_FIELDS = ["brief", "activity_evidence", "outreach_angle", "outreach_subject", "outreach_email"] as const;
export const RESEARCH_LIST_FIELDS = ["website_findings", "pain_points", "how_we_help"] as const;

export type ResearchTextField = (typeof RESEARCH_TEXT_FIELDS)[number];
export type ResearchListField = (typeof RESEARCH_LIST_FIELDS)[number];

export type ResearchOverrides = Partial<
  Record<ResearchTextField, string>
  & Record<ResearchListField, string[]>
  & { service_fit: ServiceFit[] }
>;

export type ResearchField = ResearchTextField | ResearchListField | "service_fit";

export const RESEARCH_FIELD_LABELS: Record<ResearchField, string> = {
  brief: "Brief",
  activity_evidence: "Still trading?",
  website_findings: "Website findings",
  pain_points: "Pain points",
  how_we_help: "How CDS Space helps",
  service_fit: "Service fit",
  outreach_angle: "Outreach angle",
  outreach_subject: "Suggested email subject",
  outreach_email: "Suggested first email",
};

const MAX_TEXT = 6000;
const MAX_ITEMS = 12;
const MAX_ITEM = 1500;

function cleanText(value: unknown, max = MAX_TEXT) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}

function cleanList(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanText(item, MAX_ITEM))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

function cleanServiceFit(value: unknown): ServiceFit[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => ({
      service: cleanText((entry as ServiceFit | null)?.service, 160),
      reason: cleanText((entry as ServiceFit | null)?.reason, MAX_ITEM),
    }))
    .filter((entry) => entry.service)
    .slice(0, MAX_ITEMS);
}

/**
 * Applies a set of edits to the overrides already stored. A field sent as null
 * is reset to the research; anything not named is left as it was.
 */
export function mergeResearchOverrides(current: unknown, changes: unknown): ResearchOverrides {
  const next: Record<string, unknown> = { ...sanitizeResearchOverrides(current) };
  const input = changes && typeof changes === "object" ? changes as Record<string, unknown> : {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null) { delete next[key]; continue; }
    if ((RESEARCH_TEXT_FIELDS as readonly string[]).includes(key)) next[key] = cleanText(value);
    else if ((RESEARCH_LIST_FIELDS as readonly string[]).includes(key)) next[key] = cleanList(value);
    else if (key === "service_fit") next[key] = cleanServiceFit(value);
  }
  return next as ResearchOverrides;
}

/** Keeps only known fields, each in its expected shape. */
export function sanitizeResearchOverrides(value: unknown): ResearchOverrides {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  for (const key of RESEARCH_TEXT_FIELDS) if (typeof input[key] === "string") out[key] = cleanText(input[key]);
  for (const key of RESEARCH_LIST_FIELDS) if (Array.isArray(input[key])) out[key] = cleanList(input[key]);
  if (Array.isArray(input.service_fit)) out.service_fit = cleanServiceFit(input.service_fit);
  return out as ResearchOverrides;
}

/** The research as the team has corrected it: each edited field replaces the researched one. */
export function applyResearchOverrides<T extends Record<string, any>>(company: T, overrides: unknown): T {
  return { ...company, ...sanitizeResearchOverrides(overrides) };
}
