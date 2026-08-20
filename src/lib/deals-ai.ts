import "server-only";

import { chatComplete } from "@/lib/ai/openai";
import type { SiteResearch, WebSearchResult } from "@/lib/sales-growth-research";

export interface DealProposalContent {
  executive_summary: string;
  current_state: string;
  opportunity: string;
  proposed_approach: string;
  deliverables: string[];
  market_metrics: Array<{ label: string; value: string; context: string; source_url: string }>;
  expected_impact: string[];
  timeline: string;
  next_step: string;
}

export interface DealAuditContent {
  summary: string;
  scores: Array<{ area: string; score: number; explanation: string }>;
  findings: Array<{ title: string; severity: "high" | "medium" | "low"; evidence: string; source_url: string }>;
  recommendations: Array<{ priority: number; title: string; action: string; expected_outcome: string }>;
  future_state: string;
  metrics: Array<{ label: string; value: number; maximum: number }>;
}

function cleanArray(value: unknown, max = 10) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, max)
    : [];
}

function objectFrom(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI returned an invalid object.");
  return parsed as Record<string, unknown>;
}

function score(value: unknown, fallback = 60) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || fallback)));
}

function canUseAi() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function buildDealProposalContent(input: {
  brandName: string;
  focusArea: string;
  targetUrl: string;
  socialUrl: string;
  research: SiteResearch | null;
  marketSources: WebSearchResult[];
}): Promise<DealProposalContent> {
  const observed = input.research?.description || input.research?.title || `${input.brandName} has an opportunity to clarify how its value is communicated.`;
  const fallback: DealProposalContent = {
    executive_summary: `CDS Space proposes a focused ${input.focusArea} engagement for ${input.brandName}, grounded in a review of its current public-facing brand and digital experience.`,
    current_state: `${observed} The available public evidence suggests that the most useful starting point is to align the organisation's message, visual system, and priority customer journey before expanding execution.`,
    opportunity: `Create a clearer and more consistent expression of ${input.brandName} so customers can understand the offer faster and experience the same level of confidence across its major touchpoints.`,
    proposed_approach: "Begin with evidence review and stakeholder alignment, define the core communication system, translate it into the agreed priority touchpoints, and document the system for consistent future use.",
    deliverables: ["Public brand and experience review", "Message and positioning direction", input.focusArea, "Implementation-ready design system", "Usage guidance and handover"],
    market_metrics: [],
    expected_impact: ["Clearer communication of the business offer", "More consistent visual execution across priority touchpoints", "A stronger foundation for future campaigns and sales conversations"],
    timeline: "The detailed delivery schedule will be confirmed after scope validation and access to the required brand materials.",
    next_step: "Schedule a focused working session to validate the opportunity, agree the priority deliverables, and confirm the project scope.",
  };
  if (!canUseAi()) return fallback;

  const system = [
    "You are the senior proposal strategist for CDS Space Branding Agency.",
    "Return strict JSON with executive_summary, current_state, opportunity, proposed_approach, deliverables[], market_metrics[], expected_impact[], timeline, next_step.",
    "Each market_metrics item must contain label, value, context, source_url. Include a metric only when the supplied source snippet explicitly supports the exact number. Otherwise omit it.",
    "Use only the supplied public evidence. Never invent market size, growth rates, customers, results, awards, budgets, or relationships.",
    "Expected impact must be framed as a reasonable outcome, not a guarantee. State uncertainty where evidence is incomplete.",
    "Write a detailed but editable professional proposal with clear commercial reasoning and no hype.",
  ].join("\n");
  const evidence = {
    brand_name: input.brandName,
    focus_area: input.focusArea,
    target_url: input.targetUrl,
    social_url: input.socialUrl,
    website: input.research ? {
      title: input.research.title,
      description: input.research.description,
      text: input.research.text.slice(0, 14_000),
      sources: input.research.sources,
      signals: input.research.brandSignals,
      technical_metrics: input.research.technicalMetrics,
    } : null,
    market_sources: input.marketSources.map((source) => ({ title: source.title, url: source.url, description: source.description })),
  };
  try {
    const { text } = await chatComplete(
      [{ role: "system", content: system }, { role: "user", content: JSON.stringify(evidence).slice(0, 28_000) }],
      { response_format: { type: "json_object" }, temperature: 0.3, max_tokens: 2600 },
    );
    const data = objectFrom(text);
    const rawMetrics = Array.isArray(data.market_metrics) ? data.market_metrics : [];
    const sourceUrls = new Set(input.marketSources.map((source) => source.url));
    const marketMetrics = rawMetrics.flatMap((entry) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const sourceUrl = String(item.source_url || "").trim();
      const label = String(item.label || "").trim();
      const value = String(item.value || "").trim();
      if (!label || !value || !sourceUrls.has(sourceUrl)) return [];
      return [{ label, value, context: String(item.context || "").trim(), source_url: sourceUrl }];
    }).slice(0, 6);
    return {
      executive_summary: String(data.executive_summary || fallback.executive_summary).trim(),
      current_state: String(data.current_state || fallback.current_state).trim(),
      opportunity: String(data.opportunity || fallback.opportunity).trim(),
      proposed_approach: String(data.proposed_approach || fallback.proposed_approach).trim(),
      deliverables: cleanArray(data.deliverables, 10).length ? cleanArray(data.deliverables, 10) : fallback.deliverables,
      market_metrics: marketMetrics,
      expected_impact: cleanArray(data.expected_impact, 8).length ? cleanArray(data.expected_impact, 8) : fallback.expected_impact,
      timeline: String(data.timeline || fallback.timeline).trim(),
      next_step: String(data.next_step || fallback.next_step).trim(),
    };
  } catch {
    return fallback;
  }
}

export async function buildDealBrandAudit(input: {
  brandName: string;
  targetUrl: string;
  socialUrl: string;
  research: SiteResearch;
}): Promise<DealAuditContent> {
  const technical = input.research.technicalMetrics;
  const messagingScore = technical.meta_description_length >= 70 && technical.meta_description_length <= 170 ? 72 : 52;
  const experienceScore = technical.heading_count > 0 && technical.internal_link_count < 120 ? 68 : 50;
  const identityScore = input.research.brandSignals.some((signal) => /legacy Twitter/i.test(signal)) ? 44 : 64;
  const fallbackScores = [
    { area: "Brand identity", score: identityScore, explanation: "Preliminary score based on detectable public brand signals; visual confirmation is still required." },
    { area: "Messaging clarity", score: messagingScore, explanation: "Based on homepage title, description, and visible public copy." },
    { area: "Digital experience", score: experienceScore, explanation: "Based on public page structure, navigation signals, headings, and content density." },
    { area: "Consistency", score: 60, explanation: "A preliminary benchmark pending review of more brand touchpoints." },
  ];
  const fallback: DealAuditContent = {
    summary: `${input.brandName} has a usable public foundation, with the clearest opportunity in aligning its message, visual identity, and digital experience into one recognisable system.`,
    scores: fallbackScores,
    findings: input.research.brandSignals.map((signal) => ({ title: "Public brand signal", severity: "medium" as const, evidence: signal, source_url: input.research.sources[0] || input.targetUrl })).concat([
      { title: "Homepage communication structure", severity: "medium", evidence: `The homepage exposes ${technical.heading_count} headings, ${technical.internal_link_count} internal links, and approximately ${technical.visible_text_characters} visible text characters.`, source_url: input.research.sources[0] || input.targetUrl },
    ]).slice(0, 8),
    recommendations: [
      { priority: 1, title: "Clarify the primary promise", action: "Define one customer-facing value statement and make every priority page support it.", expected_outcome: "Visitors understand the offer and relevance faster." },
      { priority: 2, title: "Unify the visual system", action: "Audit and standardise logo use, typography, colour, imagery, and social identifiers.", expected_outcome: "The brand becomes more recognisable across channels." },
      { priority: 3, title: "Simplify priority journeys", action: "Reduce competing messages and guide each audience toward one clear next action.", expected_outcome: "The digital experience becomes easier to navigate and act on." },
    ],
    future_state: `A clearer ${input.brandName} system in which the message, identity, website, and campaign assets reinforce the same market position.`,
    metrics: fallbackScores.map((entry) => ({ label: entry.area, value: entry.score, maximum: 100 })),
  };
  if (!canUseAi()) return fallback;

  const system = [
    "You are a rigorous brand identity and digital experience auditor for CDS Space.",
    "Return strict JSON with summary, scores[], findings[], recommendations[], future_state, metrics[].",
    "Scores items: area, score 0-100, explanation. Findings: title, severity high|medium|low, evidence, source_url. Recommendations: priority, title, action, expected_outcome. Metrics: label, value, maximum.",
    "Use only supplied public evidence. Do not claim to have visually seen anything not present in the evidence. Treat legacy-logo detection as a signal requiring confirmation.",
    "Explain current state, the cost of inconsistency, and a credible future state. Avoid invented commercial results.",
  ].join("\n");
  try {
    const { text } = await chatComplete(
      [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ ...input, research: { ...input.research, text: input.research.text.slice(0, 18_000) } }).slice(0, 28_000) }],
      { response_format: { type: "json_object" }, temperature: 0.25, max_tokens: 2800 },
    );
    const data = objectFrom(text);
    const sourceUrls = new Set(input.research.sources);
    const scores = (Array.isArray(data.scores) ? data.scores : []).flatMap((entry) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const area = String(item.area || "").trim();
      if (!area) return [];
      return [{ area, score: score(item.score), explanation: String(item.explanation || "").trim() }];
    }).slice(0, 8);
    const findings = (Array.isArray(data.findings) ? data.findings : []).flatMap((entry) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const title = String(item.title || "").trim();
      const sourceUrl = String(item.source_url || "").trim();
      if (!title || !sourceUrls.has(sourceUrl)) return [];
      const severity = ["high", "medium", "low"].includes(String(item.severity)) ? String(item.severity) as "high" | "medium" | "low" : "medium";
      return [{ title, severity, evidence: String(item.evidence || "").trim(), source_url: sourceUrl }];
    }).slice(0, 10);
    const recommendations = (Array.isArray(data.recommendations) ? data.recommendations : []).flatMap((entry, index) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const title = String(item.title || "").trim();
      if (!title) return [];
      return [{ priority: Math.max(1, Math.round(Number(item.priority) || index + 1)), title, action: String(item.action || "").trim(), expected_outcome: String(item.expected_outcome || "").trim() }];
    }).slice(0, 8);
    const finalScores = scores.length ? scores : fallback.scores;
    return {
      summary: String(data.summary || fallback.summary).trim(),
      scores: finalScores,
      findings: findings.length ? findings : fallback.findings,
      recommendations: recommendations.length ? recommendations : fallback.recommendations,
      future_state: String(data.future_state || fallback.future_state).trim(),
      metrics: finalScores.map((entry) => ({ label: entry.area, value: entry.score, maximum: 100 })),
    };
  } catch {
    return fallback;
  }
}
