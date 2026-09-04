/**
 * A focused, on-demand audit of how a company shows up in the era of AI search.
 *
 * Enrichment grades a website the way a designer would: is it dated, is it
 * broken, is the branding consistent. This asks a different question, and the
 * one that has started to decide whether a business is found at all - can an
 * answer engine read this company, quote it, and recommend it?
 *
 * Every check is a fact read from the live site, not a model's opinion, so the
 * findings can be put in front of a prospect without hedging. The model that
 * writes the email is given these findings; it is never asked to invent them.
 */

import { fetchPublicPage, fetchPublicText } from "@/lib/sales-growth-research";

export interface AuditFinding {
  /** Which of the four areas this belongs to. */
  area: "ai_search" | "website" | "social" | "video";
  /** Short label for the UI. */
  title: string;
  /** What was actually observed, in plain words. */
  detail: string;
  /** How much it costs them: high findings lead the email. */
  severity: "high" | "medium" | "low";
  /** Where it was observed, so a claim can be checked before sending. */
  evidence: string;
}

export interface AiAudit {
  findings: AuditFinding[];
  /** Everything that checked out, so the email does not insult good work. */
  strengths: string[];
  checked: string[];
  /** True when the site could not be reached at all. */
  unreachable: boolean;
}

/** The crawlers that feed the assistants people now ask instead of searching. */
const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "PerplexityBot", "Google-Extended", "CCBot", "Applebot-Extended"];

/** Markup that dates a page to the 1990s and that no parser treats as meaning. */
const DEPRECATED_TAGS = /<\/?(font|center|marquee|blink|frameset|frame|big|strike|tt|applet)\b/gi;

function has(html: string, pattern: RegExp) {
  return pattern.test(html);
}

/**
 * Reads robots.txt and reports which AI crawlers are turned away. A company
 * that blocks these is invisible to the assistants its customers now ask,
 * which is usually an accident inherited from a template.
 */
async function auditCrawlerAccess(origin: string) {
  try {
    const robots = await fetchPublicText(`${origin}/robots.txt`, 200_000);
    const blocked: string[] = [];
    // Each "User-agent" stanza runs until the next one, so a Disallow is only
    // read against the agent it actually belongs to.
    const stanzas = robots.split(/\n(?=user-agent:)/i);
    for (const stanza of stanzas) {
      const agents = Array.from(stanza.matchAll(/user-agent:\s*(.+)/gi)).map((match) => match[1].trim());
      const disallowsRoot = /disallow:\s*\/\s*$/im.test(stanza);
      if (!disallowsRoot) continue;
      for (const agent of agents) {
        if (agent === "*") { blocked.push("every crawler"); continue; }
        const match = AI_CRAWLERS.find((bot) => bot.toLowerCase() === agent.toLowerCase());
        if (match) blocked.push(match);
      }
    }
    return { found: true, blocked: Array.from(new Set(blocked)) };
  } catch {
    return { found: false, blocked: [] as string[] };
  }
}

/** llms.txt is the emerging convention for telling an assistant what a site is. */
async function hasLlmsTxt(origin: string) {
  try {
    const body = await fetchPublicText(`${origin}/llms.txt`, 50_000);
    return body.trim().length > 20;
  } catch {
    return false;
  }
}

async function hasSitemap(origin: string) {
  try {
    const body = await fetchPublicText(`${origin}/sitemap.xml`, 200_000);
    return /<urlset|<sitemapindex/i.test(body);
  } catch {
    return false;
  }
}

export async function auditForAiSearch(input: {
  companyName: string;
  website: string | null;
  domain: string | null;
  socials: Array<{ platform: string; url: string }>;
  brandFindings: Array<{ area: string; status: string; detail: string }>;
}): Promise<AiAudit> {
  const findings: AuditFinding[] = [];
  const strengths: string[] = [];
  const checked: string[] = [];

  const root = input.website || (input.domain ? `https://${input.domain}/` : null);
  if (!root) {
    return {
      findings: [{
        area: "ai_search",
        title: "No website an assistant can read",
        detail: `No working website was found for ${input.companyName}. When someone asks an assistant for a supplier in this category, there is no page for it to read, quote, or link to, so the company cannot be recommended at all.`,
        severity: "high",
        evidence: "No reachable website in the directory record",
      }],
      strengths: [],
      checked: ["website reachability"],
      unreachable: true,
    };
  }

  let page: Awaited<ReturnType<typeof fetchPublicPage>>;
  try {
    page = await fetchPublicPage(root);
  } catch {
    return {
      findings: [{
        area: "website",
        title: "The website did not respond",
        detail: `${root} could not be loaded. A site that fails for our crawler fails for search engines and for the assistants people now ask, and it is very likely failing for some customers too.`,
        severity: "high",
        evidence: root,
      }],
      strengths: [],
      checked: ["website reachability"],
      unreachable: true,
    };
  }

  const html = page.html;
  const origin = new URL(page.url).origin;
  checked.push("homepage markup", "structured data", "metadata", "AI crawler access", "llms.txt", "sitemap", "video presence", "social presence");

  // --- Answer-engine readability -------------------------------------------
  const jsonLd = Array.from(html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi));
  const schemaTypes = new Set<string>();
  for (const block of jsonLd) {
    for (const type of block[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)) schemaTypes.add(type[1]);
  }
  if (!schemaTypes.size) {
    findings.push({
      area: "ai_search",
      title: "No structured data for an assistant to quote",
      detail: `The homepage carries no schema.org structured data, so nothing on it is machine-readable as a fact. An assistant asked to name a supplier can read the words but cannot confirm what the company is, where it operates, what it sells, or how to contact it, so it recommends a competitor whose page does state those things.`,
      severity: "high",
      evidence: page.url,
    });
  } else {
    strengths.push(`Structured data is present (${Array.from(schemaTypes).slice(0, 5).join(", ")})`);
    if (!schemaTypes.has("FAQPage") && !schemaTypes.has("QAPage")) {
      findings.push({
        area: "ai_search",
        title: "No question-and-answer markup",
        detail: "The site has structured data but no FAQ or Q&A markup. Answer engines lift their answers from question-shaped content, so a page that never states a customer question in the customer's own words rarely becomes the quoted source.",
        severity: "medium",
        evidence: page.url,
      });
    }
  }

  const crawlers = await auditCrawlerAccess(origin);
  if (crawlers.blocked.length) {
    findings.push({
      area: "ai_search",
      title: "AI assistants are blocked from the site",
      detail: `robots.txt turns away ${crawlers.blocked.join(", ")}. Every customer who asks an assistant about this category is answered without this company in the running, usually because the block was inherited from a template rather than chosen.`,
      severity: "high",
      evidence: `${origin}/robots.txt`,
    });
  } else if (crawlers.found) {
    strengths.push("AI crawlers are allowed through robots.txt");
  }

  if (!(await hasLlmsTxt(origin))) {
    findings.push({
      area: "ai_search",
      title: "No llms.txt",
      detail: "There is no llms.txt, the file that tells an assistant in plain language what the company does and which pages are authoritative. Without it an assistant guesses from whatever page it happened to crawl, which is how businesses end up described in terms they would never use themselves.",
      severity: "medium",
      evidence: `${origin}/llms.txt`,
    });
  } else {
    strengths.push("An llms.txt is published");
  }

  if (!(await hasSitemap(origin))) {
    findings.push({
      area: "ai_search",
      title: "No XML sitemap",
      detail: "No sitemap.xml was found, so crawlers discover pages only by following links. Anything not linked from the homepage is effectively invisible.",
      severity: "medium",
      evidence: `${origin}/sitemap.xml`,
    });
  }

  // --- Metadata -------------------------------------------------------------
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || "";
  if (description.trim().length < 40) {
    findings.push({
      area: "ai_search",
      title: "No usable meta description",
      detail: "The homepage has no meaningful meta description. That single sentence is what a search result, a social preview and an assistant's summary all fall back on, so the company's own words are replaced by whatever fragment the machine picks.",
      severity: "high",
      evidence: page.url,
    });
  }
  if (!has(html, /<meta[^>]+property=["']og:(title|image)["']/i)) {
    findings.push({
      area: "social",
      title: "Links to the site preview badly",
      detail: "No Open Graph title or image is set, so every time the site is shared in a message, a post or a pitch deck it appears as a bare link with no picture. The company loses the first impression at exactly the moment someone is recommending it.",
      severity: "medium",
      evidence: page.url,
    });
  }

  // --- Markup quality -------------------------------------------------------
  const deprecated = Array.from(new Set(Array.from(html.matchAll(DEPRECATED_TAGS)).map((match) => match[1].toLowerCase())));
  if (deprecated.length) {
    findings.push({
      area: "website",
      title: "The page is built with obsolete markup",
      detail: `The homepage still uses ${deprecated.map((tag) => `<${tag}>`).join(", ")}, elements dropped from the HTML standard years ago. Beyond the dated appearance, they carry no meaning, so a machine reading the page cannot tell a heading from a caption, and the site is very likely difficult to use on a phone.`,
      severity: "high",
      evidence: page.url,
    });
  }
  if (!has(html, /<meta[^>]+name=["']viewport["']/i)) {
    findings.push({
      area: "website",
      title: "Not built for phones",
      detail: "There is no viewport declaration, which means the site was not built to adapt to a phone screen. Most first visits to a site like this arrive on a phone.",
      severity: "high",
      evidence: page.url,
    });
  }
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count === 0) {
    findings.push({
      area: "ai_search",
      title: "The homepage states no headline",
      detail: "There is no h1 on the homepage, so neither a search engine nor an assistant can tell what the page is chiefly about. The strongest signal a page has is simply missing.",
      severity: "medium",
      evidence: page.url,
    });
  }
  const images = (html.match(/<img\b[^>]*>/gi) || []);
  const missingAlt = images.filter((tag) => !/\balt\s*=\s*["'][^"']+["']/i.test(tag)).length;
  if (images.length > 3 && missingAlt / images.length > 0.4) {
    findings.push({
      area: "website",
      title: "Most images are unreadable to a machine",
      detail: `${missingAlt} of ${images.length} homepage images carry no alt text. Those images are invisible to assistants, to search, and to anyone using a screen reader, and in many markets that last point is a legal exposure.`,
      severity: "medium",
      evidence: page.url,
    });
  }
  if (!page.url.startsWith("https://")) {
    findings.push({
      area: "website",
      title: "The site is not served over HTTPS",
      detail: "The homepage loads over plain HTTP, so browsers mark it as not secure. Visitors are shown a warning before they read a word.",
      severity: "high",
      evidence: page.url,
    });
  }

  // --- Video ----------------------------------------------------------------
  const hasVideo = has(html, /<video\b/i) || has(html, /(youtube\.com\/embed|player\.vimeo\.com|wistia|loom\.com\/embed)/i);
  const hasVideoChannel = input.socials.some((entry) => ["youtube", "tiktok"].includes(entry.platform));
  if (!hasVideo && !hasVideoChannel) {
    findings.push({
      area: "video",
      title: "No video anywhere",
      detail: "There is no video on the homepage and no video channel among the company's public accounts. Video is now the default way a buyer decides whether to trust a supplier before contacting them, and it is the format both social platforms and search results push hardest. A company with none is asking to be judged on text alone.",
      severity: "high",
      evidence: page.url,
    });
  } else if (!hasVideo && hasVideoChannel) {
    findings.push({
      area: "video",
      title: "Video exists but not where it converts",
      detail: "There is a video channel but no video on the homepage, so the work is doing nothing for the visitors who are closest to buying. The asset is already paid for; it is simply in the wrong place.",
      severity: "medium",
      evidence: page.url,
    });
  } else {
    strengths.push("Video is present on the site");
  }

  // --- Social branding ------------------------------------------------------
  if (!input.socials.length) {
    findings.push({
      area: "social",
      title: "No social presence was found",
      detail: "No public social account could be traced to this company. Buyers check for one before they enquire, and an absence reads as either a business that has stopped trading or one nobody is minding.",
      severity: "high",
      evidence: "Open web search for the company's accounts",
    });
  } else {
    const inconsistent = input.brandFindings.filter((entry) => entry.status && entry.status !== "consistent" && entry.status !== "ok");
    if (inconsistent.length) {
      findings.push({
        area: "social",
        title: "The brand does not match itself across platforms",
        detail: `The website and the social accounts disagree on ${inconsistent.map((entry) => entry.area).join(", ")}. ${inconsistent[0]?.detail || ""} A buyer who moves between the two cannot tell whether they are looking at the same company, and every inconsistency is a reason to hesitate.`.trim(),
        severity: "medium",
        evidence: input.socials.map((entry) => entry.url).slice(0, 3).join(", "),
      });
    } else {
      strengths.push(`Active on ${input.socials.map((entry) => entry.platform).join(", ")}`);
    }
  }

  // Worst first, so whoever reads this leads with what actually costs money.
  const rank = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { findings, strengths, checked, unreachable: false };
}
