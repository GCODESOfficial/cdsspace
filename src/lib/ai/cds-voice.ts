/**
 * How CDS Space writes to someone it has not met yet: first emails, proposal
 * copy, and the note that delivers a proposal.
 *
 * The rule underneath all of it: show them something about their brand or
 * business they have not considered, before asking them to consider CDS Space.
 * Every writer that talks to a prospect takes its voice from here, so the
 * tone cannot drift between the email, the proposal and the follow-up.
 */

/** Who every first email is signed and sent by. Settings can override it. */
export const CDS_SENDER = {
  name: process.env.PROSPECT_SENDER_NAME || "Chris John",
  title: process.env.PROSPECT_SENDER_TITLE || "Founder and CEO, CDS Space",
};

/**
 * The model that writes copy people will read. Research and classification
 * stay on the cheaper default; writing is where a stronger model shows.
 */
export const WRITING_MODEL = process.env.OPENAI_WRITING_MODEL || "gpt-4.1";

/** The voice, as instructions a model can follow. */
export const CDS_VOICE = [
  "You write for CDS Space, a brand, design and digital product studio. The voice is calm, observant and generous: a senior practitioner who has studied this business and has something worth showing them, never a salesperson.",
  "Lead with understanding, not judgement. Before saying anything about their brand or website, show that you understand what the business is, who it serves, and what it is trying to achieve. The reader should think: they actually looked at us.",
  "Respect what already exists. Name what works and the character worth keeping. Frame every gap as an opportunity you noticed, never as something they got wrong. Never call their website, brand or work bad, outdated, poor, weak or broken.",
  "Write like one thoughtful person to another: specific nouns, concrete details from the evidence, short plain sentences. No buzzwords, no hype, no flattery, no exclamation marks.",
  "Use ASCII characters only. Never use em dashes or en dashes; use a comma or a full stop.",
].join(" ");

/**
 * Not every finding matters to every company. A holding company's credibility
 * does not rest on how modern its homepage looks; a consumer brand's might.
 */
export const MATERIALITY_RULE = [
  "Judge every finding against what this company's digital presence is actually for.",
  "First decide what the website and channels need to do for this company (for example: reassure investors, help customers find a product, recruit, support existing clients, sell online).",
  "Only raise a finding if it plausibly affects that purpose. Leave out anything that does not, however true it is.",
  "Never claim a finding hurts their credibility, revenue or customers unless the evidence shows that link for a business like theirs.",
  "Speak about what a visitor experiences: how easily they find what they came for, how the interface looks and reads, and how consistently the brand presents itself. Never mention code or technology (HTML, CSS, markup, attributes, doctype, meta tags, viewport, JavaScript, jQuery, Bootstrap, frameworks, plugins, SEO tags). Translate a technical finding into its visible effect, or leave it out.",
  "If no finding clearly affects what visitors experience, do not manufacture a problem: offer a perspective on how the brand presents itself across its website and channels instead.",
].join(" ");

/** Words that turn an observation into a technical audit nobody asked for. */
export const JARGON = /\b(html|css|markup|doctype|meta (?:tag|description)|viewport|javascript|jquery|bootstrap|srcset|attributes?|plugins?|frameworks?|codebase|source code)\b/i;

/** The shape of a first email that gets a reply. */
export const FIRST_EMAIL_PRINCIPLES = [
  "Structure the email in five moves: recognition, observation, implication, value, and a low-friction next step.",
  "Recognition: open with one sentence that shows you understand what makes this company distinctive. Do not open with a greeting about yourself, your agency, or how you found them.",
  "Observation: name one specific thing you noticed, stated as an opportunity, and where you saw it.",
  "Implication: one sentence on why it matters for what they are trying to achieve.",
  "Value: offer something useful you have already prepared, such as a short visual assessment or three observations, while preserving the character of what they have built.",
  "Next step: ask a small permission question that is easy to say yes to, such as whether it would be useful if you sent the observations. Never ask for a call or a meeting in a first email, and never ask to 'discuss how we can help'.",
  "Keep the body between 90 and 150 words, in two to four short paragraphs. No bullet points, headings, links or markdown.",
  "The subject line is under 60 characters, reads like a person wrote it, and names the observation rather than pitching, for example: A few observations on <Company>'s digital experience.",
].join(" ");

/**
 * Phrases that mark a message as templated. If a draft contains one, the
 * writer is asked to rewrite it once without them.
 */
export const BANNED_PHRASES = [
  "i hope this email finds you well",
  "i hope this finds you well",
  "i hope you are doing well",
  "i noticed",
  "i came across",
  "we specialize in",
  "we specialise in",
  "i would love to discuss",
  "i'd love to discuss",
  "would love to connect",
  "looking forward to your response",
  "looking forward to hearing from you",
  "hop on a call",
  "quick call",
  "synergy",
  "synergies",
  "leverage",
  "elevate",
  "unlock",
  "game-changer",
  "game changer",
  "in today's digital landscape",
  "in today's fast-paced",
  "digital landscape",
  "cutting-edge",
  "cutting edge",
  "take it to the next level",
  "next level",
  "drive engagement",
  "enhance user experience",
  "boost your",
  "skyrocket",
  "revolutionize",
  "revolutionise",
  "seamless",
  "world-class",
  "best-in-class",
  "lacks mobile optimization",
  "affecting your credibility",
  "driving potential customers away",
];

/** Banned phrases found in a draft, as written in the list. */
export function findBannedPhrases(text: string): string[] {
  const haystack = ` ${String(text || "").toLowerCase().replace(/[‘’]/g, "'")} `;
  return BANNED_PHRASES.filter((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(haystack);
  });
}

/**
 * Plain ASCII copy. Dashes, curly quotes, ellipses and bullets are normalised
 * and emoji removed, so a draft never fails the content-style check on its way
 * to a client. The long dashes are built from their code points on purpose: a
 * literal one in this file would itself trip that check.
 */
const LONG_DASHES = new RegExp("\\s*[" + String.fromCharCode(0x2014, 0x2015) + "]\\s*", "g");

export function cleanCopy(input: string): string {
  if (!input) return "";
  return String(input)
    .replace(LONG_DASHES, ", ")
    .replace(/–/g, "-")
    .replace(/…/g, "...")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[•●◦⁃]/g, "-")
    .replace(/ /g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}

/** How a proposal reads: written for this client and no other. */
export const PROPOSAL_VOICE = [
  CDS_VOICE,
  "A proposal is the next chapter of a conversation, not a brochure. Write every section for this client only: if a sentence would fit any company after swapping the name, rewrite it with something specific to them.",
  "Open from what the client stands for and is trying to achieve, then show you understood the situation, then the work. Frame gaps as opportunities with a clear reason, never as failings.",
  `Never use these phrases or anything like them: ${BANNED_PHRASES.slice(0, 40).join("; ")}.`,
].join(" ");

/** cleanCopy applied to every string in a parsed AI result. */
export function cleanDeep<T>(value: T): T {
  if (typeof value === "string") return cleanCopy(value) as unknown as T;
  if (Array.isArray(value)) return value.map((entry) => cleanDeep(entry)) as unknown as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, cleanDeep(entry)])) as T;
  }
  return value;
}

const LEGAL_SUFFIX = /[,\s]+(?:inc|incorporated|ltd|limited|llc|plc|corp|corporation|co|company|s\.?a\.?|ag|gmbh|n\.?v\.?|pty|pte)\.?$/i;

/** "BERKSHIRE HATHAWAY INC" becomes "Berkshire Hathaway". */
export function friendlyCompanyName(name: string) {
  let value = String(name || "").trim();
  for (let i = 0; i < 2; i += 1) value = value.replace(LEGAL_SUFFIX, "").trim();
  if (value && value === value.toUpperCase() && /[A-Z]{3,}/.test(value)) {
    value = value.toLowerCase().replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
  }
  return value || String(name || "").trim();
}
