/**
 * The numbers behind the brand-audit graphics, and the colours they wear.
 *
 * Shared by the web report and the PDF so both draw the same chart from the
 * same figures. Nothing here renders; it only decides what a chart is showing.
 *
 * Colour: the touchpoint states are a status scale, not a series palette, so
 * every state ships with its written label and the colour never carries the
 * meaning alone. The four meaningful states were validated on a white surface
 * (lightness band, chroma floor, CVD separation, normal-vision separation and
 * 3:1 contrast all pass; worst adjacent pair is weak vs missing at CVD dE 14.0,
 * normal dE 15.5). "Not assessed" is deliberately achromatic: it is the absence
 * of a reading, and it should look like it.
 */
import type { DealAuditContent, DealAuditTouchpoint } from "@/lib/deals-ai";

export type AuditStateKey = DealAuditTouchpoint["state"];

export const TOUCHPOINT_STATE_ORDER: AuditStateKey[] = ["strong", "adequate", "weak", "missing", "unknown"];

export const TOUCHPOINT_STATE: Record<AuditStateKey, { label: string; color: string; short: string }> = {
  strong: { label: "Strong", color: "#0CA30C", short: "Working" },
  adequate: { label: "Adequate", color: "#2A78D6", short: "Acceptable" },
  weak: { label: "Needs work", color: "#E07A2F", short: "Needs work" },
  missing: { label: "Missing", color: "#C0392B", short: "Missing" },
  unknown: { label: "Not assessed", color: "#898781", short: "Not assessed" },
};

export const SEVERITY_ORDER = ["high", "medium", "low"] as const;
export const SEVERITY: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "#C0392B" },
  medium: { label: "Medium", color: "#E07A2F" },
  low: { label: "Low", color: "#2A78D6" },
};

/** The report's own accent, used for the single-series score marks. */
export const AUDIT_BLUE = "#0A4FE8";
export const AUDIT_TRACK = "#E3EBFB";

export type AuditChartData = {
  score: number;
  /** One bar per scored area, tallest first so the eye starts at the strongest. */
  scores: Array<{ area: string; score: number; explanation: string }>;
  /** Counts per state, in health order, for the stacked touchpoint bar. */
  states: Array<{ key: AuditStateKey; label: string; color: string; count: number; share: number }>;
  touchpointTotal: number;
  /** How many touchpoints are working, as the headline of the stacked bar. */
  healthy: number;
  severities: Array<{ key: string; label: string; color: string; count: number }>;
  findingsTotal: number;
};

/** Title-cases a scorecard area, since the model returns bare keys like "identity". */
export function areaLabel(area: string) {
  const value = String(area || "").replace(/[_-]+/g, " ").trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Area";
}

export function auditChartData(content: DealAuditContent | null | undefined, overall: number | null): AuditChartData {
  const scores = (content?.scores || [])
    .map((item) => ({ area: areaLabel(item.area), score: Math.max(0, Math.min(100, Number(item.score) || 0)), explanation: item.explanation || "" }))
    .sort((a, b) => b.score - a.score);

  const touchpoints = content?.touchpoints || [];
  const states = TOUCHPOINT_STATE_ORDER.map((key) => {
    const count = touchpoints.filter((entry) => entry.state === key).length;
    return {
      key,
      label: TOUCHPOINT_STATE[key].label,
      color: TOUCHPOINT_STATE[key].color,
      count,
      share: touchpoints.length ? count / touchpoints.length : 0,
    };
  }).filter((entry) => entry.count > 0);

  const findings = content?.findings || [];
  const severities = SEVERITY_ORDER.map((key) => ({
    key,
    label: SEVERITY[key].label,
    color: SEVERITY[key].color,
    count: findings.filter((entry) => entry.severity === key).length,
  })).filter((entry) => entry.count > 0);

  return {
    score: Math.max(0, Math.min(100, Number(overall) || 0)),
    scores,
    states,
    touchpointTotal: touchpoints.length,
    healthy: touchpoints.filter((entry) => entry.state === "strong" || entry.state === "adequate").length,
    severities,
    findingsTotal: findings.length,
  };
}
