import "server-only";

import { chatComplete } from "@/lib/ai/openai";
import type { BrandFinding } from "@/lib/prospect-brand";
import type { SiteResearch, WebSearchResult } from "@/lib/sales-growth-research";
import { emptyDeck, normalizeDeck, type ProposalDeck } from "@/lib/proposal-deck";

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
  /** One entry per place the brand is met, so nothing is judged on the homepage alone. */
  touchpoints: DealAuditTouchpoint[];
}

export type DealAuditTouchpoint = {
  key: string;
  label: string;
  state: "strong" | "adequate" | "weak" | "missing" | "unknown";
  observation: string;
  fix: string;
  evidence: string[];
};

/**
 * Everywhere a brand is met before anyone speaks to it. The audit answers for
 * each one, so a report cannot be strong on the homepage and silent everywhere
 * else. Kept here so the report, the PDF and the public page agree on the list.
 */
import type { SocialSweep } from "@/lib/deal-audit-social";
import { socialObservationFrom, socialScoreFrom } from "@/lib/deal-audit-social";

export const AUDIT_TOUCHPOINTS: Array<{ key: string; label: string; asks: string }> = [
  { key: "identity", label: "Visual identity", asks: "Logo use, colour, typography, imagery, and whether they hold together." },
  { key: "messaging", label: "Messaging", asks: "The promise on the homepage, who it is for, and how quickly it lands." },
  { key: "website", label: "Website experience", asks: "Structure, navigation, speed signals, mobile handling, and the path to an enquiry." },
  { key: "content", label: "Content and proof", asks: "Case studies, testimonials, and whether claims are evidenced." },
  { key: "social", label: "Social presence", asks: "Which channels exist, whether they are current, and whether they look like the same brand." },
  { key: "search", label: "Search and AI discovery", asks: "Titles, descriptions, structured data, and how the brand reads to a search or AI answer." },
  { key: "conversion", label: "Enquiry and conversion", asks: "Contact routes, forms, response promises, and friction before a first conversation." },
  { key: "consistency", label: "Cross-channel consistency", asks: "Whether the website, social and search results describe one recognisable business." },
];

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
  const cleanedFocus = input.focusArea.replace(/\s+/g, " ").trim();
  const projectFocus = cleanedFocus.match(/^[^.!?]+[.!?]?/)?.[0]?.slice(0, 240).replace(/[.!?]+$/, "") || "the agreed project";
  const observed = input.research?.description || input.research?.title || `${input.brandName} has an opportunity to clarify how its value is communicated.`;
  const fallback: DealProposalContent = {
    executive_summary: `CDS Space proposes a focused engagement for ${input.brandName}: ${projectFocus}. The work will be shaped around the purpose of this project, the people it must serve, and the practical result the team needs to achieve.`,
    current_state: `${observed} The first step is to validate the underlying need, the intended audience, and the constraints around this specific project before defining what should be delivered.`,
    opportunity: `Turn ${projectFocus} into a clear, usable initiative that supports ${input.brandName}'s immediate priorities and creates lasting value beyond the initial delivery.`,
    proposed_approach: "Align on the project objective and success criteria, translate them into a fit-for-purpose scope, deliver the agreed outputs, and leave the team with the guidance needed to use and sustain the work.",
    deliverables: ["Project discovery and success criteria", `A defined direction for ${projectFocus}`, "The agreed project outputs", "Implementation and adoption guidance", "Handover and next-step roadmap"],
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
    "The focus_area is the primary source of truth for what the engagement actually is. Describe that project, its audience, deliverables, adoption, and business purpose.",
    "Do not default to a website overhaul, redesign, SEO, navigation, site performance, or digital transformation unless the focus_area or evidence makes that work central to the requested engagement.",
    "Prefer precise project language such as programme, campaign, identity system, product, communications initiative, operational system, or research engagement when that is what the evidence supports.",
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
  /** Extra channels found by prospect research, so social is judged on evidence. */
  socials?: Array<{ platform: string; url: string }>;
  /** Website-to-social identity findings, including verified logo variants. */
  brandConsistency?: BrandFinding[];
  /** Every platform checked and what was found, so absence is evidenced. */
  socialSweep?: SocialSweep | null;
  /** What the team asked to be reconsidered on a refine, plus the audit it is refining. */
  refineNote?: string;
  previous?: DealAuditContent | null;
}): Promise<DealAuditContent> {
  const technical = input.research.technicalMetrics;
  const messagingScore = technical.meta_description_length >= 70 && technical.meta_description_length <= 170 ? 72 : 52;
  const experienceScore = technical.heading_count > 0 && technical.internal_link_count < 120 ? 68 : 50;
  const sweep = input.socialSweep || null;
  // Absence is only reportable when we actually went and looked for it.
  const sweptAndEmpty = Boolean(sweep && !sweep.found.length);
  const confirmedBrandDifferences = (input.brandConsistency || []).filter((finding) => finding.status === "differs");
  const confirmedBrandMatches = (input.brandConsistency || []).filter((finding) => finding.status === "consistent" || finding.status === "variant");
  const identityScore = confirmedBrandDifferences.length ? 44 : confirmedBrandMatches.length ? 74 : 64;
  const consistencyScore = confirmedBrandDifferences.length ? 46 : confirmedBrandMatches.length ? 76 : 60;
  const fallbackScores = [
    ...(sweep ? [{
      area: "Social presence",
      score: socialScoreFrom(sweep),
      explanation: socialObservationFrom(sweep, input.brandName),
    }] : []),
    { area: "Brand identity", score: identityScore, explanation: confirmedBrandMatches.length ? "The website and reviewed social channels use the same core identity, including valid crop, lockup, colour, and format variants." : "Preliminary score based on detectable public brand signals; visual confirmation is still required." },
    { area: "Messaging clarity", score: messagingScore, explanation: "Based on homepage title, description, and visible public copy." },
    { area: "Digital experience", score: experienceScore, explanation: "Based on public page structure, navigation signals, headings, and content density." },
    { area: "Consistency", score: consistencyScore, explanation: confirmedBrandDifferences.length ? "A high-confidence cross-channel identity difference requires review." : confirmedBrandMatches.length ? "Reviewed website and social identity assets belong to the same brand family." : "A preliminary benchmark pending review of more brand touchpoints." },
  ];
  const fallback: DealAuditContent = {
    summary: `${input.brandName} has a usable public foundation, with the clearest opportunity in aligning its message, visual identity, and digital experience into one recognisable system.`,
    scores: fallbackScores,
    findings: (sweptAndEmpty
      ? [{
        title: "The brand is not findable on any social platform",
        severity: "high" as const,
        evidence: `${input.brandName} could not be found on ${sweep!.checks.map((check) => check.label).join(", ")}. The website's own pages publish no link to any profile, and a search for each platform by name surfaced none. Anyone who hears the name and looks anywhere other than the website finds nothing.`,
        source_url: input.targetUrl,
      }]
      : (sweep?.undiscoverable.length ? [{
        title: `Not findable on ${sweep.undiscoverable.join(", ")}`,
        severity: "medium" as const,
        evidence: `A profile was found on ${sweep.found.map((found) => found.platform).join(", ")}, but ${sweep.undiscoverable.join(", ")} could not be reached from the website's published links or a search by name.`,
        source_url: input.targetUrl,
      }] : [])
    ).concat(confirmedBrandDifferences.map((finding) => ({ title: finding.area, severity: "medium" as const, evidence: finding.detail, source_url: finding.evidence[0] || input.targetUrl }))).concat(input.research.brandSignals.map((signal) => ({ title: "Public brand signal", severity: "medium" as const, evidence: signal, source_url: input.research.sources[0] || input.targetUrl }))).concat([
      { title: "Homepage communication structure", severity: "medium", evidence: `The homepage exposes ${technical.heading_count} headings, ${technical.internal_link_count} internal links, and approximately ${technical.visible_text_characters} visible text characters.`, source_url: input.research.sources[0] || input.targetUrl },
    ]).slice(0, 8),
    recommendations: [
      ...(sweptAndEmpty ? [
        { priority: 1, title: "Confirm what exists, then claim what does not", action: `Check internally whether ${input.brandName} already runs any of ${sweep!.checks.map((check) => check.label).join(", ")}. Register the handles that are genuinely free, and for any account that already exists, link it from the website so it can be found at all.`, expected_outcome: "The brand holds its own name everywhere a buyer might search, and existing channels stop being invisible." },
        { priority: 2, title: "Brand the two channels this audience actually uses", action: `Set up ${sweep!.checks.slice(0, 2).map((check) => check.label).join(" and ")} properly: the website logo, the exact registered name, one line saying what the company does and for whom, and a link back to the site.`, expected_outcome: "A searcher who finds the profile before the website gets the same clear answer either way." },
        { priority: 3, title: "Give each channel a reason to exist", action: "Decide what each channel is for before posting: announcements, proof of work, hiring, or support. A channel with no purpose reads worse than no channel.", expected_outcome: "Presence that supports the brand rather than sitting visibly dormant." },
      ] : []),
      { priority: 1, title: "Clarify the primary promise", action: "Define one customer-facing value statement and make every priority page support it.", expected_outcome: "Visitors understand the offer and relevance faster." },
      { priority: 2, title: "Unify the visual system", action: "Audit and standardise logo use, typography, colour, imagery, and social identifiers.", expected_outcome: "The brand becomes more recognisable across channels." },
      { priority: 3, title: "Simplify priority journeys", action: "Reduce competing messages and guide each audience toward one clear next action.", expected_outcome: "The digital experience becomes easier to navigate and act on." },
    ].map((entry, index) => ({ ...entry, priority: index + 1 })),
    future_state: `A clearer ${input.brandName} system in which the message, identity, website, and campaign assets reinforce the same market position.`,
    metrics: fallbackScores.map((entry) => ({ label: entry.area, value: entry.score, maximum: 100 })),
    // Without AI the touchpoints are still listed, marked unknown rather than
    // guessed, so the report never implies a channel was checked when it was not.
    touchpoints: AUDIT_TOUCHPOINTS.map((entry) => {
      if (entry.key === "social" && sweep) {
        return {
          key: entry.key,
          label: entry.label,
          state: (sweep.found.length === 0 ? "missing" : confirmedBrandDifferences.length ? "weak" : sweep.found.length >= 3 ? "adequate" : "weak") as DealAuditTouchpoint["state"],
          observation: socialObservationFrom(sweep, input.brandName),
          fix: sweep.found.length === 0
            ? `Open and brand the channels this audience actually uses, starting with ${sweep.checks.slice(0, 2).map((check) => check.label).join(" and ")}. Each needs the same logo, name, and one-line description as the website before anything is posted.`
            : `Link or open the channels that could not be found (${sweep.undiscoverable.join(", ")}), and bring every profile onto the same identity as the website.`,
          evidence: [...sweep.found.map((found) => found.url), ...input.research.sources].slice(0, 4),
        };
      }
      return {
        key: entry.key,
        label: entry.label,
        state: (entry.key === "social" && !(input.socials || []).length && !input.socialUrl
          ? "missing"
          : entry.key === "social" && confirmedBrandDifferences.length
            ? "weak"
            : entry.key === "social" && confirmedBrandMatches.length
              ? "adequate"
              : "unknown") as DealAuditTouchpoint["state"],
        observation: entry.key === "social" && !(input.socials || []).length && !input.socialUrl
          ? "No public social channel was found from the website or the research."
          : entry.key === "social" && confirmedBrandDifferences.length
            ? confirmedBrandDifferences.map((finding) => finding.detail).join(" ")
            : entry.key === "social" && confirmedBrandMatches.length
              ? "The reviewed social images and website artwork use the same core brand identity. Differences in crop, lockup, canvas, colourway, or format are valid variants."
              : "Not assessed automatically. Review this touchpoint before sending the audit out.",
        fix: entry.asks,
        evidence: input.research.sources.slice(0, 1),
      };
    }),
  };
  if (!canUseAi()) return fallback;

  const system = [
    "You are a rigorous brand identity and digital experience auditor for CDS Space.",
    "Return strict JSON with summary, scores[], findings[], recommendations[], future_state, metrics[], touchpoints[].",
    "Scores items: area, score 0-100, explanation. Findings: title, severity high|medium|low, evidence, source_url. Recommendations: priority, title, action, expected_outcome. Metrics: label, value, maximum.",
    `Touchpoints: answer for every one of these keys and no others: ${AUDIT_TOUCHPOINTS.map((entry) => `${entry.key} (${entry.label}: ${entry.asks})`).join("; ")}.`,
    "Each touchpoint: key, label, state strong|adequate|weak|missing|unknown, observation, fix, evidence[] of supplied source urls. Use 'unknown' when the evidence does not cover that touchpoint. Never invent a channel that is not in the evidence.",
    "Use only supplied public evidence. Do not claim to have visually seen anything not present in the evidence.",
    "A symbol-only profile image, wordmark, horizontal or stacked lockup, different crop, padding, aspect ratio, resolution, monochrome treatment, reversed colourway, or light/dark version can be a valid variant of the same identity. Never call these inconsistent merely because the image files or dimensions differ. Report an identity inconsistency only when the supplied brand_consistency evidence has status differs.",
    // A sweep is the difference between "we found nothing" and "there is
    // nothing", and the report has to be able to show which one it means.
    "social_sweep lists every platform searched and the outcome for each. Treat it as the complete record of the social check. Name the platforms in your social observation rather than saying a presence was simply not identified, and state how each absence was established.",
    "When social_sweep found no profile anywhere, that is a high severity finding, not a middling one. Score the social area accordingly, set the social touchpoint to missing, and say plainly what it costs the brand: nobody who hears the name can verify the company anywhere but its own website.",
    "social_sweep reports findability, not existence. A search and a page fetch cannot prove an account does not exist, so write about what a customer can and cannot find, never that the company has no accounts. Where nothing was found, say it could not be found from the website's published links or a search, and that it is worth confirming by hand.",
    "When social_sweep found no profile anywhere, your recommendations must include claiming the name on the listed platforms and standing up the two that suit this audience, with the specifics of what each profile needs. Do not recommend improving, auditing or refreshing channels that do not exist.",
    "Never report a platform as present unless social_sweep lists a profile url for it.",
    "Explain current state, the cost of inconsistency, and a credible future state. Avoid invented commercial results.",
    input.refineNote
      ? "You are refining an existing audit. Keep everything that still holds and change only what the refinement note asks for. The note is an instruction from the team, not evidence: never treat it as a new public fact."
      : "",
  ].filter(Boolean).join("\n");
  try {
    const { text } = await chatComplete(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({
            brandName: input.brandName,
            targetUrl: input.targetUrl,
            socialUrl: input.socialUrl,
            socials: input.socials || [],
            social_sweep: input.socialSweep
              ? {
                platforms_checked: input.socialSweep.checks.map((check) => ({
                  platform: check.label,
                  profile_found: check.found,
                  url: check.url || null,
                  established_by: check.method,
                  why_it_matters: check.matters,
                })),
                total_found: input.socialSweep.found.length,
                none_found_on: input.socialSweep.undiscoverable,
              }
              : null,
            brand_consistency: input.brandConsistency || [],
            refinement_note: input.refineNote || "",
            previous_audit: input.previous || null,
            research: { ...input.research, text: input.research.text.slice(0, 18_000) },
          }).slice(0, 30_000),
        },
      ],
      { response_format: { type: "json_object" }, temperature: 0.25, max_tokens: 3600 },
    );
    const data = objectFrom(text);
    const sourceUrls = new Set([
      input.targetUrl,
      ...input.research.sources,
      ...(input.socials || []).map((entry) => entry.url),
      ...(input.brandConsistency || []).flatMap((entry) => entry.evidence),
    ]);
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
    // Touchpoints are rebuilt from our own list rather than the model's, so the
    // report always covers the same ground and cannot quietly drop a channel.
    const returned = new Map<string, Record<string, unknown>>();
    for (const entry of Array.isArray(data.touchpoints) ? data.touchpoints : []) {
      if (entry && typeof entry === "object") {
        const item = entry as Record<string, unknown>;
        const key = String(item.key || "").trim();
        if (key) returned.set(key, item);
      }
    }
    const touchpoints = AUDIT_TOUCHPOINTS.map((entry) => {
      const item = returned.get(entry.key) || {};
      const state = String(item.state || "");
      return {
        key: entry.key,
        label: entry.label,
        state: (["strong", "adequate", "weak", "missing", "unknown"].includes(state) ? state : "unknown") as DealAuditTouchpoint["state"],
        observation: String(item.observation || "Not covered by the captured evidence.").trim(),
        fix: String(item.fix || entry.asks).trim(),
        evidence: (Array.isArray(item.evidence) ? item.evidence : [])
          .map((value) => String(value || "").trim())
          .filter((value) => sourceUrls.has(value))
          .slice(0, 4),
      };
    });

    // The sweep is fact, the model's reading of it is not. Where the two
    // disagree about social presence, the sweep wins: a brand that could not be
    // found on a single platform must not come back as a middling score with a
    // reassuring sentence.
    if (sweep) {
      const socialIndex = touchpoints.findIndex((entry) => entry.key === "social");
      if (socialIndex >= 0) {
        const claimsPresence = ["strong", "adequate"].includes(touchpoints[socialIndex].state);
        if (!sweep.found.length) {
          touchpoints[socialIndex] = {
            ...touchpoints[socialIndex],
            state: "missing",
            observation: claimsPresence || touchpoints[socialIndex].state === "unknown"
              ? socialObservationFrom(sweep, input.brandName)
              : touchpoints[socialIndex].observation,
            evidence: input.research.sources.slice(0, 1),
          };
        } else if (touchpoints[socialIndex].state === "unknown") {
          touchpoints[socialIndex] = {
            ...touchpoints[socialIndex],
            state: sweep.found.length >= 3 ? "adequate" : "weak",
            observation: socialObservationFrom(sweep, input.brandName),
            evidence: sweep.found.map((found) => found.url).slice(0, 4),
          };
        }
      }
    }

    const ceiling = sweep ? socialScoreFrom(sweep) : 100;
    const finalScores = (scores.length ? scores : fallback.scores).map((entry) => (
      sweep && /social/i.test(entry.area) && entry.score > ceiling
        ? { ...entry, score: ceiling, explanation: socialObservationFrom(sweep, input.brandName) }
        : entry
    ));
    return {
      summary: String(data.summary || fallback.summary).trim(),
      scores: finalScores,
      findings: findings.length ? findings : fallback.findings,
      recommendations: recommendations.length ? recommendations : fallback.recommendations,
      future_state: String(data.future_state || fallback.future_state).trim(),
      metrics: finalScores.map((entry) => ({ label: entry.area, value: entry.score, maximum: 100 })),
      touchpoints,
    };
  } catch {
    return fallback;
  }
}

// Builds the nine-slide landscape deck used by the public proposal page, the
// admin editor, and the PDF. The five-stage CDS Space delivery process remains
// approved agency material; the surrounding narrative and payoff are specific
// to the project the client is actually considering.
export async function buildProposalDeck(input: {
  brandName: string;
  focusArea: string;
  targetUrl: string;
  socialUrl: string;
  title: string;
  research: SiteResearch | null;
  marketSources: WebSearchResult[];
}): Promise<ProposalDeck> {
  const fallback = emptyDeck(input.brandName, input.focusArea, input.title);
  if (!canUseAi()) return fallback;

  const system = [
    "You are the senior proposal strategist for CDS Space Branding Agency.",
    "Write the client-specific narrative for a nine-slide landscape proposal deck.",
    "Return strict JSON with these keys only: cover, who_we_are, big_picture, rewind, opportunities, payoff, kickoff, cta.",
    "cover: {title, subtitle, prepared_for}. subtitle is a single line of positioning for this client.",
    "who_we_are: {heading, body[]} - two short paragraphs. Keep CDS Space's identity as a full-service branding agency, but tilt the second paragraph toward the solution this client wants.",
    "big_picture: {heading, intro, outcomes[{title, detail}]} - the client's desired outcome, three outcomes.",
    "rewind: {heading, intro, problems[]} - the problem, stated plainly, three to five points, no blame.",
    "opportunities: {heading, intro, items[{title, detail, value}]} - money and ground currently being left on the table. If the evidence shows no obvious gap, articulate an opportunity the client could create. value is a short qualitative outcome label, never an invented figure.",
    "payoff: {heading, intro, items[]} - what the client gets for the investment, up to eight short items.",
    "kickoff: {heading, intro, steps[{title, detail}]} - exactly five steps, concluded in one to two meetings.",
    "cta: {heading, body} - invite them to schedule a meeting.",
    "Treat focus_area as the primary source of truth for the essence of this engagement. Identify the project's real purpose, intended audience, scope, deliverables, adoption needs, and business outcome before writing.",
    "Do not default to a website overhaul, website redesign, SEO, navigation, responsiveness, site performance, security, or digital transformation unless the focus_area or evidence clearly makes that work central to the project.",
    "Use the most accurate project noun supported by the brief, such as programme, campaign, identity system, communications initiative, product, operational system, research engagement, launch, or rollout. Do not call every engagement an overhaul.",
    "Make big_picture, opportunities, payoff, and kickoff describe the same specific engagement. Payoff items must be consequences of completing this project, not a canned list of website or branding benefits.",
    "When public website evidence is only background about the company, use it to understand the organisation; do not turn website observations into the proposal scope.",
    "Use only the supplied public evidence. Never invent market size, growth rates, revenue, customers, results, awards, or relationships. Never state a currency figure.",
    "Frame outcomes as reasonable expectations, not guarantees. No hype, no em dashes.",
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
      signals: input.research.brandSignals,
      technical_metrics: input.research.technicalMetrics,
    } : null,
    market_sources: input.marketSources.map((source) => ({ title: source.title, url: source.url, description: source.description })),
  };

  try {
    const { text } = await chatComplete(
      [{ role: "system", content: system }, { role: "user", content: JSON.stringify(evidence).slice(0, 28_000) }],
      { response_format: { type: "json_object" }, temperature: 0.35, max_tokens: 3200 },
    );
    return normalizeDeck(objectFrom(text), { brandName: input.brandName, focusArea: input.focusArea, title: input.title });
  } catch {
    return fallback;
  }
}

type ProposalRewriteSpec = {
  label: string;
  format: "single_line" | "paragraph" | "line_list";
  maxCharacters: number;
  maxItems?: number;
  purpose: string;
};

const PROPOSAL_REWRITE_FIELDS: Record<string, ProposalRewriteSpec> = {
  "proposal.title": { label: "Proposal title", format: "single_line", maxCharacters: 240, purpose: "Name the engagement accurately and concisely." },
  "proposal.focus_area": { label: "Project focus", format: "paragraph", maxCharacters: 1200, purpose: "State the true project need, intended work, audience, and desired result." },
  "cover.title": { label: "Deck title", format: "single_line", maxCharacters: 220, purpose: "Name the engagement and its central purpose." },
  "cover.subtitle": { label: "Title-slide subtitle", format: "single_line", maxCharacters: 220, purpose: "Express the project-specific promise without making a guarantee." },
  "who_we_are.heading": { label: "Who-we-are heading", format: "single_line", maxCharacters: 90, purpose: "Introduce CDS Space's role in this engagement." },
  "who_we_are.body": { label: "Who-we-are paragraphs", format: "line_list", maxCharacters: 3600, maxItems: 4, purpose: "Explain who CDS Space is and why its capabilities fit this project. Return one paragraph per line." },
  "big_picture.heading": { label: "Big-picture heading", format: "single_line", maxCharacters: 90, purpose: "Frame the desired future state." },
  "big_picture.intro": { label: "Big-picture introduction", format: "paragraph", maxCharacters: 1200, purpose: "Describe what success for this specific engagement looks like." },
  "rewind.heading": { label: "Problem-section heading", format: "single_line", maxCharacters: 90, purpose: "Introduce the present challenge without blaming the client." },
  "rewind.intro": { label: "Problem-section introduction", format: "paragraph", maxCharacters: 1600, purpose: "Explain why this project is needed now, using only supported context." },
  "rewind.problems": { label: "Project problems", format: "line_list", maxCharacters: 3600, maxItems: 6, purpose: "List the specific problems this engagement should solve, one per line." },
  "opportunities.heading": { label: "Opportunities heading", format: "single_line", maxCharacters: 90, purpose: "Introduce the value this project can unlock." },
  "opportunities.intro": { label: "Opportunities introduction", format: "paragraph", maxCharacters: 1200, purpose: "Connect the project to credible business or audience opportunities." },
  "process.heading": { label: "Process heading", format: "single_line", maxCharacters: 90, purpose: "Introduce how CDS Space will deliver this engagement." },
  "process.intro": { label: "Process introduction", format: "single_line", maxCharacters: 600, purpose: "Connect the approved CDS Space process to this project's purpose." },
  "process.duration_note": { label: "Duration note", format: "paragraph", maxCharacters: 600, purpose: "Set an accurate, conditional expectation for timing." },
  "payoff.heading": { label: "Payoff heading", format: "single_line", maxCharacters: 90, purpose: "Introduce the practical value of completing this engagement." },
  "payoff.intro": { label: "Payoff introduction", format: "paragraph", maxCharacters: 900, purpose: "Summarise the project-specific return in credible terms." },
  "payoff.items": { label: "Payoff items", format: "line_list", maxCharacters: 1800, maxItems: 8, purpose: "List the specific capabilities, outcomes, or assets the client gains, one per line." },
  "kickoff.heading": { label: "Kickoff heading", format: "single_line", maxCharacters: 90, purpose: "Introduce the start of the engagement." },
  "kickoff.intro": { label: "Kickoff introduction", format: "paragraph", maxCharacters: 900, purpose: "Explain how the client and CDS Space will align before delivery begins." },
  "cta.heading": { label: "Call-to-action heading", format: "single_line", maxCharacters: 120, purpose: "Invite a confident next step." },
  "cta.body": { label: "Call-to-action body", format: "paragraph", maxCharacters: 900, purpose: "Invite a scope conversation tied to this project." },
  "cta.primary_label": { label: "Call-to-action button", format: "single_line", maxCharacters: 60, purpose: "Use a short action label for the next step." },
};

export function proposalRewriteSpec(path: string): ProposalRewriteSpec | null {
  if (PROPOSAL_REWRITE_FIELDS[path]) return PROPOSAL_REWRITE_FIELDS[path];

  const point = path.match(/^(big_picture\.outcomes|opportunities\.items|kickoff\.steps)\.(\d+)\.(title|detail|value)$/);
  if (!point) return null;
  const [, section, rawIndex, property] = point;
  const index = Number(rawIndex);
  const limit = section === "kickoff.steps" ? 5 : section === "opportunities.items" ? 6 : 4;
  if (!Number.isInteger(index) || index < 0 || index >= limit) return null;
  if (property === "value" && section !== "opportunities.items") return null;

  if (property === "title") {
    return { label: "Item title", format: "single_line", maxCharacters: 160, purpose: "Name this point in language specific to the project." };
  }
  if (property === "value") {
    return { label: "Outcome label", format: "single_line", maxCharacters: 120, purpose: "State a short qualitative outcome without inventing a number or guarantee." };
  }
  return { label: "Item detail", format: "paragraph", maxCharacters: 900, purpose: "Explain this point and its relevance to the project." };
}

/**
 * Rewrites one editable proposal field without regenerating or changing any
 * other part of the deck. The full draft is context only; the response is
 * deliberately constrained to one value so the editor's existing autosave can
 * apply it as a normal field edit.
 */
export async function rewriteProposalField(input: {
  brandName: string;
  focusArea: string;
  title: string;
  fieldPath: string;
  currentValue: string;
  deck: ProposalDeck;
}): Promise<string> {
  const spec = proposalRewriteSpec(input.fieldPath);
  if (!spec) throw new Error("That proposal field cannot be rewritten.");
  if (!canUseAi()) throw new Error("OPENAI_API_KEY is not configured.");

  const structure = spec.format === "line_list"
    ? `Return only a newline-separated list with no bullets or numbering and no more than ${spec.maxItems || 8} items.`
    : spec.format === "single_line"
      ? "Return one line with no line breaks."
      : "Return one polished paragraph unless the current field clearly needs two short paragraphs.";
  const system = [
    "You are editing exactly one field in a CDS Space client proposal.",
    "Return strict JSON with one key only: {\"value\": string}.",
    `Field: ${spec.label}. Purpose: ${spec.purpose}`,
    structure,
    `Keep the value under ${spec.maxCharacters} characters.`,
    "Preserve accurate, useful substance from the current value, but improve its specificity, clarity, and commercial relevance.",
    "Treat project_focus as the source of truth for the engagement. Communicate the project's real purpose, audience, scope, deliverables, adoption needs, and intended result.",
    "Do not default to a website overhaul, redesign, SEO, navigation, responsiveness, performance, or digital transformation unless project_focus or the deck clearly makes that work central.",
    "Do not call the work an overhaul unless the brief explicitly calls for an overhaul. Use the accurate project noun supported by the context.",
    "Do not invent facts, figures, deliverables, timelines, relationships, or guaranteed outcomes. Do not use hype or em dashes.",
    "Change this field only. Do not return commentary, alternatives, markdown, or any other proposal field.",
  ].join("\n");
  const context = {
    brand_name: input.brandName,
    proposal_title: input.title,
    project_focus: input.focusArea,
    field_path: input.fieldPath,
    current_value: input.currentValue,
    proposal_context: input.deck,
  };
  const { text } = await chatComplete(
    [{ role: "system", content: system }, { role: "user", content: JSON.stringify(context).slice(0, 24_000) }],
    { response_format: { type: "json_object" }, temperature: 0.35, max_tokens: 1000 },
  );
  let value = String(objectFrom(text).value || "").trim().slice(0, spec.maxCharacters);
  if (spec.format === "single_line") value = value.replace(/\s+/g, " ").trim();
  if (spec.format === "line_list") {
    value = value.split("\n")
      .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean)
      .slice(0, spec.maxItems || 8)
      .join("\n");
  }
  if (!value) throw new Error("OpenAI returned an empty rewrite. Please try again.");
  return value;
}

/**
 * Writes the opening line for the proposal email, drawn from the deck the
 * client is about to read so the note and the proposal say the same thing.
 * Falls back to the big picture intro, which is what the sender already
 * gets when the field is left empty.
 */
export async function buildProposalEmailOpening(input: {
  brandName: string;
  focusArea: string;
  deck: ProposalDeck;
}): Promise<string> {
  const fallback = input.deck.big_picture.intro;
  if (!canUseAi()) return fallback;

  const system = [
    "You write the opening line of an email that delivers a branding proposal to a prospective client.",
    "Return strict JSON: {\"message\": string}.",
    "Two to three sentences, at most 60 words. Warm, direct, and specific to this client.",
    "Ground every claim in the supplied deck. Never invent figures, results, timelines, or relationships.",
    "Do not greet the reader, do not sign off, and do not repeat the proposal title - the email template already carries those.",
    "Name the outcome the client cares about and point at the proposal. No hype, no em dashes.",
  ].join("\n");

  const evidence = {
    brand_name: input.brandName,
    focus_area: input.focusArea,
    cover: input.deck.cover,
    big_picture: input.deck.big_picture,
    rewind: input.deck.rewind,
    opportunities: input.deck.opportunities,
    payoff: input.deck.payoff,
    cta: { heading: input.deck.cta.heading, body: input.deck.cta.body },
  };

  try {
    const { text } = await chatComplete(
      [{ role: "system", content: system }, { role: "user", content: JSON.stringify(evidence).slice(0, 12_000) }],
      { response_format: { type: "json_object" }, temperature: 0.4, max_tokens: 400 },
    );
    const message = String(objectFrom(text).message || "").trim();
    return message.slice(0, 1200) || fallback;
  } catch {
    return fallback;
  }
}
