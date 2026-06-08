/* eslint-disable @typescript-eslint/no-explicit-any */
import { lagosDate } from "@/lib/timebook";

export const WORK_TRACKING_BUCKET = "work-tracking-screenshots";
export const DEFAULT_CAPTURE_INTERVAL_SECONDS = 300;
export const DEFAULT_SCREENSHOT_RETENTION_DAYS = 7;
export const DEFAULT_IDLE_THRESHOLD_SECONDS = 180;

export const WORK_TRACKING_CATEGORIES = [
  "design",
  "development",
  "content",
  "meeting",
  "research",
  "administration",
  "communication",
  "project_management",
  "idle",
  "break",
  "productive_work",
] as const;

export type WorkTrackingCategory = typeof WORK_TRACKING_CATEGORIES[number];

export interface SnapshotSignals {
  active_app?: string | null;
  page_title?: string | null;
  page_url?: string | null;
  project_hint?: string | null;
  activity_state?: string | null;
  idle_seconds?: number | null;
  ai_summary?: string | null;
}

export function clampScore(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function uniqueStrings(values: any[] = []) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function inferActivityCategories(input: SnapshotSignals): WorkTrackingCategory[] {
  const text = [
    input.active_app,
    input.page_title,
    input.page_url,
    input.project_hint,
    input.ai_summary,
  ].filter(Boolean).join(" ").toLowerCase();

  const categories: WorkTrackingCategory[] = [];
  if (input.activity_state === "break") categories.push("break");
  if (input.activity_state === "idle" || Number(input.idle_seconds || 0) >= DEFAULT_IDLE_THRESHOLD_SECONDS) {
    categories.push("idle");
  }
  if (includesAny(text, ["figma", "photoshop", "illustrator", "canva", "adobe", "sketch", "design", "ui", "ux", "brand"])) {
    categories.push("design");
  }
  if (includesAny(text, ["vscode", "visual studio", "github", "gitlab", "cursor", "terminal", "localhost", "next.js", "react", "typescript", "api", "database", "glash", "sql"])) {
    categories.push("development");
  }
  if (includesAny(text, ["docs", "document", "copy", "caption", "content", "notion", "sheet", "slides", "proposal", "brief"])) {
    categories.push("content");
  }
  if (includesAny(text, ["meet", "zoom", "teams", "call", "cmeet", "meeting", "calendar"])) {
    categories.push("meeting");
  }
  if (includesAny(text, ["google search", "research", "competitor", "youtube", "article", "linkedin", "behance", "dribbble"])) {
    categories.push("research");
  }
  if (includesAny(text, ["invoice", "payroll", "firs", "tax", "bank", "receipt", "finance", "admin", "compliance"])) {
    categories.push("administration");
  }
  if (includesAny(text, ["whatsapp", "slack", "email", "gmail", "chat", "message"])) {
    categories.push("communication");
  }
  if (includesAny(text, ["asana", "trello", "linear", "jira", "project", "task", "kanban", "milestone"])) {
    categories.push("project_management");
  }

  return uniqueStrings(categories).length > 0 ? uniqueStrings(categories) as WorkTrackingCategory[] : ["productive_work"];
}

export function inferDetectedWebsites(input: SnapshotSignals) {
  const url = String(input.page_url || "").trim();
  if (!url) return [];
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host ? [host] : [];
  } catch {
    return [];
  }
}

export function scoreSnapshot(input: SnapshotSignals) {
  const categories = inferActivityCategories(input);
  const idleSeconds = Number(input.idle_seconds || 0);
  if (categories.includes("break")) return { productivity: 0, focus: 0 };
  if (categories.includes("idle")) {
    const idlePenalty = Math.min(60, Math.round(idleSeconds / 10));
    return { productivity: clampScore(45 - idlePenalty), focus: clampScore(55 - idlePenalty) };
  }
  if (categories.includes("development") || categories.includes("design")) return { productivity: 90, focus: 88 };
  if (categories.includes("content") || categories.includes("project_management")) return { productivity: 84, focus: 82 };
  if (categories.includes("meeting") || categories.includes("communication")) return { productivity: 74, focus: 70 };
  if (categories.includes("research") || categories.includes("administration")) return { productivity: 78, focus: 76 };
  return { productivity: 80, focus: 78 };
}

export function weekRange(dateString = lagosDate()) {
  const cursor = new Date(`${dateString}T12:00:00+01:00`);
  const day = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() - day + 1);
  const start = cursor.toISOString().slice(0, 10);
  cursor.setUTCDate(cursor.getUTCDate() + 6);
  const end = cursor.toISOString().slice(0, 10);
  return { week_start: start, week_end: end };
}

function addMinutes(bucket: Record<string, number>, keys: string[], minutes: number) {
  const safeKeys = keys.length ? keys : ["productive_work"];
  for (const key of safeKeys) bucket[key] = Math.round((bucket[key] || 0) + minutes);
}

function topJson(counts: Record<string, number>, limit = 5) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, minutes]) => ({ name, minutes }));
}

export function aggregateSnapshots(snapshots: any[] = [], options: { intervalSeconds?: number; attendanceScore?: number } = {}) {
  const intervalMinutes = Math.max(1, Math.round((options.intervalSeconds || DEFAULT_CAPTURE_INTERVAL_SECONDS) / 60));
  const categoryMinutes: Record<string, number> = {};
  const projectMinutes: Record<string, number> = {};
  const appMinutes: Record<string, number> = {};
  const deliverables: string[] = [];
  const productivityScores: number[] = [];
  const focusScores: number[] = [];
  let activeMinutes = 0;
  let idleMinutes = 0;
  let meetingMinutes = 0;

  for (const snapshot of snapshots) {
    const categories = uniqueStrings(snapshot.ai_categories?.length ? snapshot.ai_categories : inferActivityCategories(snapshot));
    const isBreak = snapshot.activity_state === "break" || categories.includes("break");
    const isIdle = snapshot.activity_state === "idle" || categories.includes("idle");
    const minutes = isBreak ? 0 : intervalMinutes;

    if (!isBreak) activeMinutes += minutes;
    if (isIdle) idleMinutes += minutes;
    if (categories.includes("meeting")) meetingMinutes += minutes;

    addMinutes(categoryMinutes, categories, minutes);

    const projects = uniqueStrings([
      ...(snapshot.detected_projects || []),
      snapshot.project_hint,
    ]);
    addMinutes(projectMinutes, projects.length ? projects : ["Unassigned"], minutes);

    const apps = uniqueStrings([
      ...(snapshot.detected_apps || []),
      snapshot.active_app || "Browser",
    ]);
    addMinutes(appMinutes, apps, minutes);

    deliverables.push(...uniqueStrings(snapshot.detected_deliverables || []));
    const fallback = scoreSnapshot(snapshot);
    productivityScores.push(Number(snapshot.productivity_score ?? fallback.productivity));
    focusScores.push(Number(snapshot.focus_score ?? fallback.focus));
  }

  const average = (values: number[]) => values.length
    ? clampScore(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
  const productivity = average(productivityScores);
  const focus = average(focusScores);
  const attendance = clampScore(Number(options.attendanceScore ?? (activeMinutes ? 85 : 0)));
  const consistency = clampScore(100 - Math.min(80, idleMinutes * 2));
  const collaboration = clampScore((categoryMinutes.meeting || 0) + (categoryMinutes.communication || 0) > 0 ? 82 : 68);
  const reliability = clampScore((attendance * 0.55) + (consistency * 0.45));
  const overall = clampScore(
    productivity * 0.32 +
    focus * 0.22 +
    attendance * 0.18 +
    consistency * 0.14 +
    collaboration * 0.07 +
    reliability * 0.07,
  );

  const topProject = topJson(projectMinutes, 1)[0]?.name || "Unassigned";
  const topApp = topJson(appMinutes, 1)[0]?.name || "No captured app";
  const idlePct = activeMinutes ? Math.round((idleMinutes / activeMinutes) * 100) : 0;

  return {
    active_minutes: activeMinutes,
    idle_minutes: idleMinutes,
    meeting_minutes: meetingMinutes,
    productivity_score: productivity,
    focus_score: focus,
    consistency_score: consistency,
    collaboration_score: collaboration,
    attendance_score: attendance,
    reliability_score: reliability,
    overall_score: overall,
    most_used_apps: topJson(appMinutes),
    time_by_category: categoryMinutes,
    time_by_project: projectMinutes,
    deliverables: uniqueStrings(deliverables),
    summary: snapshots.length
      ? `Worked mainly on ${topProject}, with ${Math.round(activeMinutes / 60 * 10) / 10} tracked hours. ${topApp} was the most active workspace. Idle time was ${idlePct}%.`
      : "No tracked work activity was captured for this period.",
    strengths: [
      productivity >= 85 ? "High productive activity detected" : "Baseline productive activity captured",
      focus >= 85 ? "Strong focus pattern" : "Focus pattern needs more data",
    ],
    concerns: [
      ...(idlePct > 20 ? ["Idle time is higher than expected"] : []),
      ...(activeMinutes === 0 ? ["No active work tracking data captured"] : []),
    ],
    manager_recommendations: [
      idlePct > 20 ? "Review blockers or workload clarity with this team member" : "Use project contribution data in the next performance check-in",
    ],
    hidden_achievements: uniqueStrings(deliverables).length
      ? uniqueStrings(deliverables).slice(0, 5)
      : [`Detected contribution focus around ${topProject}`],
  };
}

export function normalizeDate(value: string | null | undefined, fallback = lagosDate()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value! : fallback;
}

export function normalizeText(value: any) {
  return String(value || "").trim() || null;
}

export function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
