/**
 * Content Hub AI helpers - server only.
 *
 * The governing system prompt is the CDS Space Content Engine (below): it sets
 * positioning, voice, framework selection, CTA + hashtag rules. Every output is
 * additionally run through `toAscii()` which strips em/en dashes, smart quotes
 * and emojis, guaranteeing ASCII-English content even if the model slips.
 *
 * Built on the in-house OpenAI client (src/lib/ai/openai.ts) so Content Hub
 * shares the same key, error handling and bundle as the rest of the app.
 */
import { chatComplete, type ChatMessage } from "@/lib/ai/openai";

/** Default number of hashtags when nothing is configured in content_settings. */
export const DEFAULT_HASHTAGS = 3;

/**
 * Build the few-shot "learn from our best content" block that gets appended to
 * the system prompt. Callers pass the brand's top-performing posts so the model
 * emulates their structure/voice without copying them.
 */
function exemplarBlock(exemplars?: string) {
  const t = (exemplars || "").trim();
  if (!t) return "";
  return `\n\n## TOP-PERFORMING REFERENCE POSTS\nThese are the brand's best-performing posts. Study and emulate their hook style, structure, rhythm, length and voice. Do NOT copy them verbatim or reuse their specific facts, names or numbers.\n\n${t}`;
}

// ── CDS Space Content Engine v1.0 - the AI brain for all content generation ──
const CONTENT_ENGINE = `# CDS SPACE CONTENT ENGINE v1.0

You are the official Content Generation Engine for CDS Space Branding Agency.

## Company Context
CDS Space is not a design agency. CDS Space is a business growth infrastructure
company that uses branding, design, technology, systems, automation,
communication and digital transformation to help businesses become more
credible, more visible, more trusted and more profitable. Website: cdsspace.pro

Core Philosophy: We do not sell logos, websites or graphics. We sell business
growth, trust, positioning, perception, visibility, digital transformation and
business systems. Every piece of content must reinforce this positioning.

## Content Objectives
Every piece of content must achieve one or more of: build authority, generate
leads, build trust, educate, drive consultation bookings, drive business
inquiries. If a sentence does not contribute to these objectives, remove it.

## Writing Style
Write like a world-class branding consultant, a business strategist and a growth
advisor. Avoid generic agency language, design jargon and empty hype. Use
business outcomes, strategic thinking, clear language and thought leadership.
Keep posts concise: 80 to 180 words. Never use emojis unless requested.

## CTA Rules
End every post with a consultation-focused CTA. Good examples:
"Book a consultation with CDS Space at cdsspace.pro"
"Ready to position your business for growth? Let's talk."
"Need clarity on your next branding decision? Book a consultation at cdsspace.pro"
Do not use weak CTAs (follow us, like and share, let us know). Focus on
consultation, discovery call, brand audit, inquiry.

## Hashtag Rules
Use relevant, non-spammy hashtags drawn from themes like Branding, Business
Growth, Digital Transformation, Marketing, Entrepreneurship, Startups,
Technology. Use 6 to 12 hashtags.

## Framework Selection (choose the best automatically)
- Branding Insight Post: Hook, Insight, Business Lesson, CTA
- Website / Product Post: Challenge, Solution, Business Outcome, CTA
- Educational Post: Hook, Teaching, Takeaway, CTA
- Case Study: Problem, Solution, Transformation, CTA
- Founder Thought Leadership: Observation, Lesson, Application, CTA

## Systems Mode
When the work is about systems/dashboards/internal tools/automation/HR systems,
position CDS Space as builders, operators, infrastructure creators, automation
experts and system architects. Tone: future-focused, operational, strategic.

## Hiring Mode
For recruitment content, focus on opportunity, growth, excellence and team
culture. Never sound desperate. Position CDS Space as a place where ambitious
people build meaningful careers. CTA: Apply via cdsspace.pro/career

## Positioning Rules
Reinforce at least one belief: Great brands are built through consistency.
Branding is business strategy made visible. Recognition compounds slowly. Trust
drives revenue. Brand failure is usually misalignment, not aesthetics. Systems
create scale. Businesses grow when perception and execution align. Great brands
are built everywhere. Digital transformation is a competitive advantage. Value
creates demand.

Always optimize for authority, trust, lead generation and consultation bookings.
Do not explain your reasoning. Only provide the final content.`;

// Hard, non-negotiable formatting constraints (also enforced by toAscii()).
const STYLE_RULES = `STRICT FORMATTING RULES (non-negotiable):
- Use ASCII English characters only.
- Never use em dashes or en dashes. Use a comma, a period, or rephrase.
- Never use smart/curly quotes; use straight quotes only.
- Never use emojis unless explicitly requested.`;

/**
 * Force content to ASCII English: normalise dashes, smart quotes, ellipses and
 * bullets to ASCII, and remove emoji/pictographs. Accented Latin letters are
 * kept so names are not mangled.
 */
export function toAscii(input: string): string {
  if (!input) return "";
  return input
    .replace(/-/g, "-")               // em dash -
    .replace(/–/g, "-")               // en dash –
    .replace(/―/g, "-")               // horizontal bar
    .replace(/…/g, "...")             // ellipsis …
    .replace(/[‘’‚‛]/g, "'") // single curly quotes
    .replace(/[“”„‟]/g, '"') // double curly quotes
    .replace(/[•‣◦⁃]/g, "-") // bullets •
    .replace(/ /g, " ")               // non-breaking space
    // strip emoji / symbols / dingbats / variation selectors / flags
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}

function deepAscii<T>(value: T): T {
  if (typeof value === "string") return toAscii(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepAscii(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepAscii(v);
    return out as T;
  }
  return value;
}

const TONE_GUIDES: Record<string, string> = {
  professional: "Polished, authoritative, business-appropriate.",
  founder: "First-person founder voice: visionary, candid, motivational.",
  tcj: "TCJ tone: bold, punchy, culture-forward and slightly playful.",
  cdsspace: "CDS Space house tone: premium, strategic, confident, concise.",
};

// Full brain (positioning + style) for generation tasks.
async function runFull(task: string, user: string, opts?: { temperature?: number; max_tokens?: number; exemplars?: string }) {
  const messages: ChatMessage[] = [
    { role: "system", content: `${CONTENT_ENGINE}\n\n${STYLE_RULES}\n\n${task}${exemplarBlock(opts?.exemplars)}` },
    { role: "user", content: user },
  ];
  const { text } = await chatComplete(messages, { temperature: opts?.temperature ?? 0.7, max_tokens: opts?.max_tokens ?? 900 });
  return toAscii(text);
}

// Lite brain (style only) for tiny single-purpose tasks (hashtags, one CTA line).
async function runLite(task: string, user: string, opts?: { temperature?: number; max_tokens?: number }) {
  const messages: ChatMessage[] = [
    { role: "system", content: `You write for CDS Space, a business growth infrastructure company (branding, design, systems, digital transformation).\n\n${STYLE_RULES}\n\n${task}` },
    { role: "user", content: user },
  ];
  const { text } = await chatComplete(messages, { temperature: opts?.temperature ?? 0.6, max_tokens: opts?.max_tokens ?? 200 });
  return toAscii(text);
}

/** Step 1 - Generate with AI from a brief. Caption + consultation CTA, no hashtags (the wizard adds those). */
export function generateFromBrief(input: { topic: string; audience?: string; platform?: string; tone?: string; objective?: string; exemplars?: string }) {
  const toneNote = input.tone ? `Voice: ${TONE_GUIDES[input.tone] || input.tone}` : "";
  const user = `Write a post-ready social caption.
Topic: ${input.topic}
${input.audience ? `Audience: ${input.audience}` : ""}
${input.platform ? `Platform: ${input.platform}` : ""}
${input.objective ? `Objective: ${input.objective}` : ""}
${toneNote}
End with a consultation-focused CTA. Do NOT include hashtags. Return only the caption text.`;
  return runFull("Produce a single post-ready caption that ends with a consultation CTA.", user, { exemplars: input.exemplars });
}

/** Step 1 - Generate a full post from an uploaded image/design/flyer. */
export function generateFromImage(input: { imageUrl: string; note?: string; platform?: string; hashtags?: number; exemplars?: string }) {
  const n = input.hashtags ?? DEFAULT_HASHTAGS;
  const user = `An admin uploaded a design/flyer/graphic (${input.imageUrl}).
${input.note ? `Context: ${input.note}` : ""}
${input.platform ? `Platform: ${input.platform}` : ""}
Write the full social post: a caption in the CDS Space voice, then a consultation CTA on its own line, then exactly ${n} hashtags on the final line. Return only that content.`;
  return runFull("Generate a complete social post (caption, CTA, hashtags) for an uploaded design.", user, { exemplars: input.exemplars });
}

/** Step 1 - Generate a full post from an uploaded video/reel/event footage. */
export function generateFromVideo(input: { videoUrl: string; note?: string; platform?: string; hashtags?: number; exemplars?: string }) {
  const n = input.hashtags ?? DEFAULT_HASHTAGS;
  const user = `An admin uploaded a video/reel/event footage (${input.videoUrl}).
${input.note ? `What it covers: ${input.note}` : ""}
${input.platform ? `Platform: ${input.platform}` : ""}
Write the full social post: a caption, then a consultation CTA on its own line, then exactly ${n} hashtags on the final line. Return only that content.`;
  return runFull("Generate a complete social post from an uploaded video.", user, { exemplars: input.exemplars });
}

/** Step 3 - Enhancement actions on existing content. */
export function enhance(action: string, content: string, tone?: string, exemplars?: string) {
  const map: Record<string, string> = {
    improve: "Improve this content: sharper hook, clearer business value, better flow. Keep the meaning.",
    rewrite: "Rewrite this content fresh while keeping the same message and intent.",
    expand: "Expand this content with more strategic detail and depth (stay within 180 words).",
    shorten: "Shorten this content to its punchiest, most scannable form.",
    storytelling: "Rework this into a short story-driven post with a clear narrative arc.",
    hook: "Rewrite the opening so the first line is a scroll-stopping hook; keep the rest intact.",
  };
  const instruction = map[action] || (tone ? `Rewrite this in the ${tone} voice: ${TONE_GUIDES[tone] || ""}` : "Improve this content.");
  return runFull(`${instruction} Keep the consultation CTA. Return only the resulting content.`, content, { exemplars });
}

/** Step 3 - Apply a brand tone. */
export function applyTone(tone: string, content: string, exemplars?: string) {
  return runFull(`Rewrite the content in this voice: ${TONE_GUIDES[tone] || tone}. Keep the consultation CTA. Return only the rewritten content.`, content, { exemplars });
}

/** Step 4 - Suggest a single consultation-focused CTA. */
export function generateCta(content: string, kind?: string) {
  const user = `Suggest ONE short, consultation-focused CTA line${kind ? ` (objective: ${kind})` : ""} for this content.
Return only the CTA text, max 12 words, no quotes.\n\nCONTENT:\n${content}`;
  return runLite("You write concise, high-converting consultation CTAs for CDS Space.", user, { max_tokens: 50 });
}

/** Step 3 - Generate hashtags. Returns an array. `count` defaults to 3 (the
 * configured Content Hub default is passed in by the AI route). */
export async function generateHashtags(content: string, count = DEFAULT_HASHTAGS): Promise<string[]> {
  const n = Math.max(1, Math.min(30, Math.round(count) || DEFAULT_HASHTAGS));
  const text = await runLite(
    `Return exactly ${n} relevant, non-spammy hashtag${n === 1 ? "" : "s"} as one space-separated line, most important first. Each starts with #. No other text.`,
    content,
    { max_tokens: 120 },
  );
  return Array.from(
    new Set(text.split(/\s+/).map((t) => t.trim()).filter((t) => t.startsWith("#") && t.length > 1)),
  ).slice(0, n);
}

/** Step 3 - Generate variations. Returns an array of alternate captions. */
export async function generateVariations(content: string, count = 3): Promise<string[]> {
  const text = await runFull(
    `Produce ${count} distinct alternative versions of this content, each ending with a consultation CTA. Separate each with a line containing only "---". Return only the versions.`,
    content,
    { temperature: 0.9, max_tokens: 1100 },
  );
  return text.split(/\n-{2,}\n|\n---\n/).map((s) => toAscii(s.trim())).filter(Boolean).slice(0, count);
}

/** BSD Studio - turn a BSD video into a full platform package. Returns structured sections. */
export async function bsdPackage(input: { note: string; videoUrl?: string }) {
  const user = `Create a full BSD (Brand Strategy Day) content package from this video.
${input.videoUrl ? `Video: ${input.videoUrl}` : ""}
What it covers: ${input.note}

Return STRICT JSON (no markdown fences) with keys:
{
  "linkedin": "...", "facebook": "...", "instagram": "...",
  "x_thread": ["tweet 1", "tweet 2"], "summary": "...",
  "key_lessons": ["..."], "quote_cards": ["short quotable line"]
}
Each post must follow the CDS Space voice and end with a consultation CTA.`;
  const messages: ChatMessage[] = [
    { role: "system", content: `${CONTENT_ENGINE}\n\n${STYLE_RULES}\n\nYou output only valid JSON, no markdown fences.` },
    { role: "user", content: user },
  ];
  const { text } = await chatComplete(messages, { temperature: 0.7, max_tokens: 1600, response_format: { type: "json_object" } });
  try {
    return deepAscii(JSON.parse(text));
  } catch {
    return { summary: toAscii(text) };
  }
}
