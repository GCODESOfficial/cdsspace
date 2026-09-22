// Shared landscape proposal deck model. Used by the generator, the editor,
// the public proposal page, and the PDF renderer so every surface renders the
// same nine slides in the same order.

export interface DeckPoint {
  title: string;
  detail: string;
}

export interface ProposalDeck {
  cover: { title: string; subtitle: string; prepared_for: string };
  who_we_are: { heading: string; body: string[] };
  big_picture: { heading: string; intro: string; outcomes: DeckPoint[] };
  rewind: { heading: string; intro: string; problems: string[] };
  opportunities: { heading: string; intro: string; items: Array<DeckPoint & { value: string }> };
  process: { heading: string; intro: string; duration_note: string };
  payoff: { heading: string; intro: string; items: string[] };
  kickoff: { heading: string; intro: string; steps: DeckPoint[] };
  cta: { heading: string; body: string; primary_label: string; primary_url: string; email: string };
}

export const PROPOSAL_CTA_URL = "https://cdsspace.pro/consultation";
export const PROPOSAL_CTA_EMAIL = "support@cdsspace.pro";

export const PROCESS_PROBLEMS = [
  "Unclear positioning",
  "Inconsistent brand experience",
  "Fragmented systems",
  "Poor customer experience",
  "Slow market growth",
  "Weak digital presence",
  "Difficult expansion",
  "Brand inconsistency",
] as const;

export const PROCESS_STAGES = [
  {
    step: "1. Discover",
    caption: "Understand Before We Build",
    summary: "We investigate your business, market, customers and existing brand ecosystem.",
    listLabel: "We Assess:",
    items: ["Business", "Market", "Customers", "Brand", "Digital", "Operations", "Competition"],
    output: "Transformation Diagnosis",
  },
  {
    step: "2. Define",
    caption: "Give The Brand Direction",
    summary: "We define where the brand should go and how it should compete.",
    listLabel: "We develop:",
    items: ["Positioning", "Strategy", "Architecture", "Messaging", "CX Strategy", "Market Entry", "Governance"],
    output: "Transformation Blueprint",
  },
  {
    step: "3. Build",
    caption: "Turn Strategy Into System",
    summary: "We transform the strategy into tangible brand systems and experiences.",
    listLabel: "We build:",
    items: ["Identity", "Digital Products", "Websites", "UI/UX", "Campaigns", "Design Systems", "Marketing Assets", "Brand Tools"],
    output: "Brand & Experience System",
  },
  {
    step: "4. Deploy",
    caption: "Put The Brand Into Motion",
    summary: "We coordinate implementation across markets, platforms and physical touchpoints.",
    listLabel: "We manage:",
    items: ["Digital Rollout", "Product Launches", "Campaigns", "Physical Rollout", "Production", "Vendors", "Market Implementation"],
    output: "Coordinated Brand Rollout",
  },
  {
    step: "5. Govern",
    caption: "Protect The Brand As It Grows",
    summary: "We create systems that keep the brand consistent, controlled and scalable.",
    listLabel: "We establish:",
    items: ["Brand Governance", "Design Systems", "Asset Management", "Approval Workflows", "Brand Audits", "Multi-Market Standards", "Continuous Optimisation"],
    output: "Brand Governance & Growth System",
  },
] as const;

export const PROCESS_PAYOFF = [
  "Stronger brand recognition",
  "Greater customer trust",
  "Consistent experiences",
  "Faster execution",
  "Better market positioning",
  "Reduced transformation risk",
  "Scalable brand infrastructure",
  "Greater commercial readiness",
] as const;

export const DEFAULT_PROCESS_NOTE =
  "The entire process takes about 4-6 weeks, except in cases where a different timeline is explicitly stated.";

export const DEFAULT_KICKOFF_STEPS: DeckPoint[] = [
  { title: "Opening discussions", detail: "You share the business, the challenges, and the ambitions behind this brief." },
  { title: "We build the big picture", detail: "Our team reviews the project, the people it must serve, and the result it needs to produce." },
  { title: "We define the scope", detail: "We recommend the right engagement and the roadmap that fits it." },
  { title: "We assemble the team", detail: "Strategy, creative, digital, and implementation specialists are aligned." },
  { title: "We begin delivery", detail: "Discover, Define, Build, Deploy, Govern - with you reviewing at each output." },
];

function text(value: unknown, max: number, fallback = "") {
  const cleaned = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
  return cleaned || fallback;
}

function paragraph(value: unknown, max: number, fallback = "") {
  const cleaned = typeof value === "string" ? value.trim().slice(0, max) : "";
  return cleaned || fallback;
}

function stringList(value: unknown, max: number, itemMax: number, fallback: string[] = []) {
  const list = Array.isArray(value)
    ? value.map((item) => text(item, itemMax)).filter(Boolean).slice(0, max)
    : [];
  return list.length ? list : fallback;
}

function pointList(value: unknown, max: number, fallback: DeckPoint[] = []) {
  const list = Array.isArray(value)
    ? value.flatMap((entry) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const title = text(item.title, 160);
      if (!title) return [];
      return [{ title, detail: paragraph(item.detail, 900) }];
    }).slice(0, max)
    : [];
  return list.length ? list : fallback;
}

export function emptyDeck(brandName: string, focusArea: string, title: string): ProposalDeck {
  const cleanedFocus = focusArea.replace(/\s+/g, " ").trim();
  const focusSentence = cleanedFocus.match(/^[^.!?]+[.!?]?/)?.[0]?.slice(0, 180) || "the agreed project";
  const projectFocus = focusSentence.replace(/[.!?]+$/, "");
  return {
    cover: {
      title: title || `${brandName} project proposal`,
      subtitle: `A focused plan for ${projectFocus}`,
      prepared_for: brandName,
    },
    who_we_are: {
      heading: "Who We Are",
      body: [
        "CDS Space is a full-service branding agency. We design and build brand systems, digital products, and physical brand experiences for founders and teams whose brand needs to keep up with how fast they are scaling.",
        `For ${brandName}, that means one team accountable for ${projectFocus} end to end, from defining the right outcome to delivering and embedding the work.`,
      ],
    },
    big_picture: {
      heading: "The Big Picture",
      intro: `What ${brandName} should be able to achieve through ${projectFocus}.`,
      outcomes: [
        { title: "A clear definition of success", detail: "The team shares one practical view of what this project must accomplish and for whom." },
        { title: "A fit-for-purpose result", detail: `The work is shaped around ${brandName}'s actual priorities rather than a generic solution.` },
        { title: "Value that lasts beyond delivery", detail: "The outputs are usable, adoptable, and supported by clear ownership and next steps." },
      ],
    },
    rewind: {
      heading: "Rewind",
      intro: "First, let us talk about the problem.",
      problems: [
        "The purpose, audience, and success criteria need to be aligned before delivery begins.",
        "The scope must translate the project ambition into clear, usable outputs.",
        "Ownership, adoption, and the next stage of the work need to be designed into the engagement.",
      ],
    },
    opportunities: {
      heading: "The Opportunities",
      intro: "What is currently being left on the table, and what becomes available once this is fixed.",
      items: [
        { title: "Sharper project decisions", detail: "A shared objective makes it easier to prioritise effort and avoid work that does not serve the outcome.", value: "Clearer scope" },
        { title: "Stronger adoption", detail: "Outputs designed around the people who will use them are more likely to become part of everyday work.", value: "Practical uptake" },
        { title: "A credible next stage", detail: "Clear handover and success criteria give the team a sound basis for measuring and extending the work.", value: "Sustainable value" },
      ],
    },
    process: {
      heading: "Our Process",
      intro: `A structured path from ${projectFocus} to implementation and adoption.`,
      duration_note: DEFAULT_PROCESS_NOTE,
    },
    payoff: {
      heading: "The Payoff",
      intro: `Practical value from delivering ${projectFocus} well.`,
      items: [
        "A shared definition of the project's purpose and success",
        "A scope shaped around the real organisational need",
        "Outputs designed for the people who will use them",
        "Clearer ownership and faster project decisions",
        "A practical route from strategy into implementation",
        "Consistent delivery across the agreed touchpoints",
        "Guidance that supports adoption after handover",
        "A credible foundation for the project's next stage",
      ],
    },
    kickoff: {
      heading: "Kickoff",
      intro: "Five simple steps, concluded in one to two meetings.",
      steps: DEFAULT_KICKOFF_STEPS.map((step) => ({ ...step })),
    },
    cta: {
      heading: "Let us get started",
      body: "Pick a time that works and we will walk through the scope together. We respond within one business day.",
      primary_label: "Schedule a meeting",
      primary_url: PROPOSAL_CTA_URL,
      email: PROPOSAL_CTA_EMAIL,
    },
  };
}

// Accepts partial or untrusted deck input (AI output or an editor payload) and
// returns a complete deck, falling back to the defaults section by section.
export function normalizeDeck(value: unknown, context: { brandName: string; focusArea: string; title: string }): ProposalDeck {
  const base = emptyDeck(context.brandName, context.focusArea, context.title);
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
  const section = (key: string) => (input[key] && typeof input[key] === "object" && !Array.isArray(input[key]) ? input[key] as Record<string, unknown> : {});

  const cover = section("cover");
  const who = section("who_we_are");
  const big = section("big_picture");
  const rewind = section("rewind");
  const opportunities = section("opportunities");
  const process = section("process");
  const payoff = section("payoff");
  const kickoff = section("kickoff");
  const cta = section("cta");

  const opportunityItems = Array.isArray(opportunities.items)
    ? (opportunities.items as unknown[]).flatMap((entry) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const title = text(item.title, 160);
      if (!title) return [];
      return [{ title, detail: paragraph(item.detail, 900), value: text(item.value, 120) }];
    }).slice(0, 6)
    : [];

  return {
    cover: {
      title: text(cover.title, 220, base.cover.title),
      subtitle: text(cover.subtitle, 220, base.cover.subtitle),
      prepared_for: text(cover.prepared_for, 180, base.cover.prepared_for),
    },
    who_we_are: {
      heading: text(who.heading, 90, base.who_we_are.heading),
      body: stringList(who.body, 4, 1200, base.who_we_are.body),
    },
    big_picture: {
      heading: text(big.heading, 90, base.big_picture.heading),
      intro: paragraph(big.intro, 1200, base.big_picture.intro),
      outcomes: pointList(big.outcomes, 4, base.big_picture.outcomes),
    },
    rewind: {
      heading: text(rewind.heading, 90, base.rewind.heading),
      intro: paragraph(rewind.intro, 1600, base.rewind.intro),
      problems: stringList(rewind.problems, 6, 600, base.rewind.problems),
    },
    opportunities: {
      heading: text(opportunities.heading, 90, base.opportunities.heading),
      intro: paragraph(opportunities.intro, 1200, base.opportunities.intro),
      items: opportunityItems.length ? opportunityItems : base.opportunities.items,
    },
    process: {
      heading: text(process.heading, 90, base.process.heading),
      intro: paragraph(process.intro, 600, base.process.intro),
      duration_note: paragraph(process.duration_note, 600, base.process.duration_note),
    },
    payoff: {
      heading: text(payoff.heading, 90, base.payoff.heading),
      intro: paragraph(payoff.intro, 900, base.payoff.intro),
      items: stringList(payoff.items, 8, 200, base.payoff.items),
    },
    kickoff: {
      heading: text(kickoff.heading, 90, base.kickoff.heading),
      intro: paragraph(kickoff.intro, 900, base.kickoff.intro),
      steps: pointList(kickoff.steps, 5, base.kickoff.steps),
    },
    cta: {
      heading: text(cta.heading, 120, base.cta.heading),
      body: paragraph(cta.body, 900, base.cta.body),
      primary_label: text(cta.primary_label, 60, base.cta.primary_label),
      primary_url: PROPOSAL_CTA_URL,
      email: PROPOSAL_CTA_EMAIL,
    },
  };
}

export const PROPOSAL_STAGES = [
  { key: "draft", label: "Draft", hint: "Being written" },
  { key: "ready", label: "Ready", hint: "Approved to send" },
  { key: "sent", label: "Sent", hint: "With the client" },
  { key: "viewed", label: "Viewed", hint: "Client opened it" },
  { key: "negotiation", label: "Negotiation", hint: "Scope and terms" },
  { key: "won", label: "Won", hint: "Signed" },
  { key: "lost", label: "Lost", hint: "Closed out" },
] as const;

export type ProposalStage = typeof PROPOSAL_STAGES[number]["key"];

/* ------------------------------------------------------------------ */
/*  Deck artwork                                                      */
/* ------------------------------------------------------------------ */

/**
 * Deck artwork, shared by the web deck and the PDF export so both surfaces show
 * the same illustration in the same place.
 *
 * Two kinds of source:
 *
 *  - Standalone illustrations in /public/proposal-svg. These are the artwork on
 *    its own, with no slide chrome, so they are drawn whole and letterboxed into
 *    their box. `w`/`h` are the file's natural viewBox size and are what keeps
 *    the aspect ratio honest on both surfaces.
 *  - A `crop` window into one of the full 1920x1080 slide exports in
 *    /public/proposal, for artwork we do not have standalone. Those exports
 *    carry their own "partner with us" bar and page-number badge across the
 *    bottom, so a window that reaches into that band renders a second footer
 *    and a second page number on top of ours. ART_SAFE_BOTTOM is where that
 *    band begins; keep `y + h` at or above it.
 */
export const ART_SAFE_BOTTOM = 862;

export const SLIDE_SOURCE_WIDTH = 1920;
export const SLIDE_SOURCE_HEIGHT = 1080;

export interface ProposalArtSource {
  /** Path under /public, including the directory. */
  src: string;
  /** Natural width of the drawn artwork. */
  w: number;
  /** Natural height of the drawn artwork. */
  h: number;
  /** Set only for artwork cropped out of a full slide export. */
  crop?: { x: number; y: number };
}

export const PROPOSAL_ART = {
  // Cropped from a full slide export; the window stops at ART_SAFE_BOTTOM.
  worldMap: { src: "proposal/Proposal-01.svg", w: 1920, h: 532, crop: { x: 0, y: 330 } },
  // Standalone artwork, drawn whole - no slide chrome, so no stray page number.
  people: { src: "proposal-svg/Assets 01.svg", w: 1052, h: 926 },
  puzzle: { src: "proposal-svg/Assets 02.svg", w: 1134, h: 1173 },
  flag: { src: "proposal-svg/Assets 03.svg", w: 1049, h: 1059 },
  keyhole: { src: "proposal-svg/Assets 04.svg", w: 602, h: 915 },
} as const satisfies Record<string, ProposalArtSource>;

export type ProposalArtKey = keyof typeof PROPOSAL_ART;

/**
 * Sets one text field inside a deck by dotted path ("big_picture.outcomes.1.title").
 *
 * The presentation view edits the deck in place, so it needs to write a single
 * value without knowing the shape around it. Every level is copied rather than
 * mutated, so React sees a new object and the autosave notices the change.
 */
export function setDeckValue(deck: ProposalDeck, path: string, value: string): ProposalDeck {
  const keys = path.split(".").filter(Boolean);
  if (!keys.length) return deck;

  const write = (node: unknown, index: number): unknown => {
    const key = keys[index];
    const last = index === keys.length - 1;
    if (Array.isArray(node)) {
      const position = Number(key);
      if (!Number.isInteger(position) || position < 0 || position >= node.length) return node;
      const copy = node.slice();
      copy[position] = last ? value : write(copy[position], index + 1);
      return copy;
    }
    if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      if (!(key in record)) return node;
      return { ...record, [key]: last ? value : write(record[key], index + 1) };
    }
    return node;
  };

  return write(deck, 0) as ProposalDeck;
}
