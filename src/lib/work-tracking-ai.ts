/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  inferActivityCategories,
  inferDetectedWebsites,
  parseJsonObject,
  scoreSnapshot,
  uniqueStrings,
  type SnapshotSignals,
} from "@/lib/work-tracking";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = process.env.OPENAI_WORK_TRACKING_MODEL || process.env.OPENAI_DEFAULT_MODEL || "gpt-4o-mini";

export interface WorkSnapshotAnalysis {
  summary: string;
  categories: string[];
  detected_apps: string[];
  detected_websites: string[];
  detected_projects: string[];
  detected_deliverables: string[];
  productivity_score: number;
  focus_score: number;
  confidence: number;
  model?: string;
  raw?: any;
}

export function fallbackSnapshotAnalysis(input: SnapshotSignals): WorkSnapshotAnalysis {
  const categories = inferActivityCategories(input);
  const scores = scoreSnapshot(input);
  const project = input.project_hint || "Unassigned";
  return {
    summary: `${categories.join(", ")} activity detected${project ? ` for ${project}` : ""}.`,
    categories,
    detected_apps: uniqueStrings([input.active_app || "Browser"]),
    detected_websites: inferDetectedWebsites(input),
    detected_projects: uniqueStrings([project]),
    detected_deliverables: [],
    productivity_score: scores.productivity,
    focus_score: scores.focus,
    confidence: input.page_title || input.active_app ? 68 : 45,
    model: "local-fallback",
  };
}

export async function analyzeSnapshotWithAi(input: SnapshotSignals & { screenshot_data_url?: string | null }): Promise<WorkSnapshotAnalysis> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !input.screenshot_data_url) return fallbackSnapshotAnalysis(input);

  const fallback = fallbackSnapshotAnalysis(input);
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You classify work screenshots for an internal productivity report. Return concise JSON only. Do not include sensitive personal content, passwords, private messages, or full document text. Summarize visible work patterns at a management level.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  task: "Analyze this single work-tracking screenshot and browser/app signals.",
                  expected_json_shape: {
                    summary: "one sentence",
                    categories: ["design|development|content|meeting|research|administration|communication|project_management|idle|productive_work"],
                    detected_apps: ["short names"],
                    detected_websites: ["domains only"],
                    detected_projects: ["project names or Unassigned"],
                    detected_deliverables: ["visible deliverables without private content"],
                    productivity_score: "0-100",
                    focus_score: "0-100",
                    confidence: "0-100",
                  },
                  signals: {
                    active_app: input.active_app || null,
                    page_title: input.page_title || null,
                    page_url: input.page_url || null,
                    project_hint: input.project_hint || null,
                    activity_state: input.activity_state || "active",
                    idle_seconds: input.idle_seconds || 0,
                  },
                }),
              },
              {
                type: "image_url",
                image_url: { url: input.screenshot_data_url, detail: "low" },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) return fallback;
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || "";
    const parsed = parseJsonObject(content);
    if (!parsed) return fallback;

    return {
      summary: String(parsed.summary || fallback.summary).slice(0, 700),
      categories: uniqueStrings(parsed.categories || fallback.categories),
      detected_apps: uniqueStrings(parsed.detected_apps || fallback.detected_apps),
      detected_websites: uniqueStrings(parsed.detected_websites || fallback.detected_websites),
      detected_projects: uniqueStrings(parsed.detected_projects || fallback.detected_projects),
      detected_deliverables: uniqueStrings(parsed.detected_deliverables || fallback.detected_deliverables),
      productivity_score: Number.isFinite(Number(parsed.productivity_score)) ? Number(parsed.productivity_score) : fallback.productivity_score,
      focus_score: Number.isFinite(Number(parsed.focus_score)) ? Number(parsed.focus_score) : fallback.focus_score,
      confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : fallback.confidence,
      model: json.model || DEFAULT_MODEL,
      raw: parsed,
    };
  } catch {
    return fallback;
  }
}
