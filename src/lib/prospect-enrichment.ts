import "server-only";

import { chatComplete } from "@/lib/ai/openai";
import { CATEGORIES } from "@/lib/constants";
import { fetchPublicPage, isSocialHost, normalizeDomain, researchPublicSite, searchOpenWeb, type SiteResearch } from "@/lib/sales-growth-research";
import { detectListing, looksLikeStartup, normalizeCountry, sizeBandFor, type SizeBand } from "@/lib/prospect-directory";
import { isExcludedDomain } from "@/lib/prospect-exclusions";
import { assessBrandConsistency, checkDomainVariants, domainVariantFinding, type BrandFinding, type DomainVariant } from "@/lib/prospect-brand";
import { EMPTY_WEBSITE_SIGNALS, detectProspectIssues, type ProspectIssue, type WebsiteSignals } from "@/lib/prospect-issues";
import { likelyMailboxes, traceDomainContacts, type DnsContact } from "@/lib/prospect-dns";

export type ActivityStatus = "unknown" | "active" | "dormant" | "inactive";
export type WebsiteStatus = "unknown" | "missing" | "broken" | "outdated" | "dated" | "modern";

export interface EnrichedContact {
  full_name: string;
  job_title: string | null;
  seniority: "decision_maker" | "influencer" | "operational" | "unknown";
  email: string | null;
  email_confidence: "verified_public" | "pattern_guess" | "unknown";
  phone: string | null;
  linkedin_url: string | null;
  source_url: string | null;
}

export interface EnrichedCompany {
  company_name: string;
  domain: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  industry: string | null;
  employee_range: string | null;
  employee_count: number | null;
  size_band: SizeBand | null;
  founded_year: number | null;
  is_public: boolean | null;
  stock_exchanges: string[];
  ticker: string | null;
  is_startup: boolean | null;
  countries: string[];
  activity_status: ActivityStatus;
  activity_evidence: string;
  website_status: WebsiteStatus;
  website_score: number | null;
  website_findings: string[];
  /** The five issues the directory filters on, from the signals above. */
  issues: ProspectIssue[];
  brand_consistency: BrandFinding[];
  domain_variants: DomainVariant[];
  dns_contacts: DnsContact[];
  suggested_mailboxes: string[];
  socials: Array<{ platform: string; url: string }>;
  emails: Array<{ email: string; source_url: string; kind: string }>;
  phones: string[];
  brief: string;
  pain_points: string[];
  how_we_help: string[];
  service_fit: Array<{ service: string; reason: string }>;
  competitors_local: Array<{ name: string; url: string; note: string }>;
  competitors_global: Array<{ name: string; url: string; note: string }>;
  outreach_angle: string;
  outreach_subject: string;
  outreach_email: string;
  deal_score: number;
  priority: "high" | "medium" | "low";
  sources: string[];
  contacts: EnrichedContact[];
}

const SERVICE_NAMES = CATEGORIES.map((category) => category.name);

const DECISION_TITLES = /\b(founder|co-?founder|owner|ceo|chief|cxo|coo|cmo|cto|cfo|president|managing director|md\b|director|partner|principal|head of|vp\b|vice president|general manager|proprietor)\b/i;
const INFLUENCER_TITLES = /\b(manager|lead|marketing|brand|communications|growth|product|design|creative|digital)\b/i;
export const GENERIC_MAILBOX = /^(info|hello|contact|support|admin|sales|enquiry|enquiries|inquiries|office|mail)@/i;

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function list(value: unknown, max: number, itemMax = 400) {
  return Array.isArray(value) ? value.map((entry) => clip(entry, itemMax)).filter(Boolean).slice(0, max) : [];
}

function objectList<T extends Record<string, string>>(value: unknown, shape: Record<keyof T, number>, max: number): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Record<string, unknown>;
    const result = {} as Record<string, string>;
    for (const [key, maxLength] of Object.entries(shape)) result[key] = clip(source[key], maxLength);
    return Object.values(result).some(Boolean) ? [result as T] : [];
  }).slice(0, max);
}

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI returned an invalid object.");
  return parsed as Record<string, unknown>;
}

function seniorityFor(title: string): EnrichedContact["seniority"] {
  if (DECISION_TITLES.test(title)) return "decision_maker";
  if (INFLUENCER_TITLES.test(title)) return "influencer";
  return title ? "operational" : "unknown";
}

/**
 * Scores how modern the public website is. Every signal is read off the served
 * markup, so a low score is evidence we can quote back in outreach rather than
 * an opinion. Lower score means a more outdated site, which is a stronger lead.
 */
function assessWebsite(html: string, research: SiteResearch | null): { status: WebsiteStatus; score: number; findings: string[]; signals: WebsiteSignals } {
  const findings: string[] = [];
  let score = 100;
  const penalise = (points: number, finding: string) => { score -= points; findings.push(finding); };
  // Each signal is recorded as well as narrated: the issue filters read these,
  // so they never depend on how a finding happens to be worded.
  const signals: WebsiteSignals = { ...EMPTY_WEBSITE_SIGNALS };

  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
    signals.noViewport = true;
    penalise(22, "No responsive viewport meta tag, so the site is unlikely to adapt to mobile screens.");
  }
  if (/<table[^>]*>[\s\S]{0,4000}?<table/i.test(html) && !/<main|<section|<article/i.test(html)) {
    signals.tableLayout = true;
    penalise(18, "Layout appears to be built with nested tables rather than modern layout elements.");
  }
  if (/<(font|center|marquee|frameset|blink)\b/i.test(html)) {
    signals.deprecatedElements = true;
    penalise(20, "Deprecated HTML elements (font, center, marquee, or frames) are still in use.");
  }
  if (/\bbgcolor=|\balign=["']?(left|right|center)/i.test(html)) {
    signals.presentationalAttributes = true;
    penalise(8, "Presentational HTML attributes are used in place of CSS.");
  }
  if (/jquery[.-](1|2)\.\d+/i.test(html)) {
    signals.endOfLifeLibraries = true;
    penalise(12, "The site loads a long-unsupported jQuery 1.x or 2.x build.");
  }
  if (/\.swf\b|application\/x-shockwave-flash/i.test(html)) {
    signals.flash = true;
    penalise(25, "Flash content is still referenced, which no browser has supported since 2020.");
  }
  if (!/<!doctype html>/i.test(html.slice(0, 400))) {
    signals.noDoctype = true;
    penalise(10, "The page does not declare a modern HTML5 doctype.");
  }
  if (!research?.description) penalise(8, "No meta description is published, which weakens search and social previews.");
  if (/bootstrap[.-]?3\.|bootstrap[.-]?2\./i.test(html)) {
    signals.endOfLifeLibraries = true;
    penalise(8, "An end-of-life Bootstrap 2 or 3 build is loaded.");
  }
  if (/https?:\/\/(?:www\.)?twitter\.com\//i.test(html)) penalise(5, "The site still links to twitter.com rather than X, a sign the footer has not been maintained.");
  if (!/<img[^>]+(srcset|loading=["']lazy["'])/i.test(html) && (html.match(/<img\b/gi) || []).length > 6) {
    signals.imagesNotResponsive = true;
    penalise(6, "Images are served without responsive srcset or lazy loading.");
  }

  const years = Array.from(html.matchAll(/(?:\u00a9|&copy;|copyright)[^0-9]{0,20}((?:19|20)\d{2})/gi)).map((match) => Number(match[1]));
  const latestYear = years.length ? Math.max(...years) : 0;
  const thisYear = new Date().getFullYear();
  if (latestYear && thisYear - latestYear >= 3) {
    signals.staleCopyrightYears = thisYear - latestYear;
    penalise(18, `The copyright notice still reads ${latestYear}, suggesting the site has not been updated in ${thisYear - latestYear} years.`);
  } else if (latestYear && thisYear - latestYear === 2) {
    signals.staleCopyrightYears = 2;
    penalise(8, `The copyright notice reads ${latestYear}.`);
  }

  score = Math.max(0, Math.min(100, score));
  const status: WebsiteStatus = score < 45 ? "outdated" : score < 70 ? "dated" : "modern";
  if (!findings.length) findings.push("No dated markup signals were detected on the homepage; confirm design quality by eye before quoting this.");
  return { status, score, findings, signals };
}

/** Recent public mentions are the cheapest proxy for "is this company still trading". */
function assessActivity(input: { reachable: boolean; html: string; mentions: Array<{ title: string; description: string }> }): { status: ActivityStatus; evidence: string } {
  if (!input.reachable) {
    return { status: "unknown", evidence: "The website could not be reached, so trading status could not be confirmed from the site itself." };
  }
  const thisYear = new Date().getFullYear();
  const recentYear = new RegExp(`\\b(${thisYear}|${thisYear - 1})\\b`);
  const siteRecent = recentYear.test(input.html);
  const mentionRecent = input.mentions.some((entry) => recentYear.test(`${entry.title} ${entry.description}`));
  const closureSignal = input.mentions.some((entry) => /\b(ceased trading|liquidation|wound up|shut down|closed down|acquired by|dissolved|bankrupt)\b/i.test(`${entry.title} ${entry.description}`));

  if (closureSignal) return { status: "inactive", evidence: "Public results mention closure, dissolution, or acquisition; verify with a registry before any outreach." };
  if (siteRecent && mentionRecent) return { status: "active", evidence: `The website and recent public results both reference ${thisYear} or ${thisYear - 1}.` };
  if (siteRecent || mentionRecent) return { status: "active", evidence: `Recent activity found in ${siteRecent ? "the website content" : "public search results"}.` };
  return { status: "dormant", evidence: "The website responds but shows no recent dated activity, and no recent public mentions were found." };
}

function scoreDeal(input: { website: { status: WebsiteStatus; score: number }; activity: ActivityStatus; contacts: EnrichedContact[]; socials: number; emails: number }) {
  let score = 0;
  // An outdated site on a trading company is exactly the brief: real need, real budget.
  if (input.website.status === "outdated") score += 35;
  else if (input.website.status === "dated") score += 25;
  else if (input.website.status === "missing" || input.website.status === "broken") score += 20;
  else score += 8;

  if (input.activity === "active") score += 25;
  else if (input.activity === "dormant") score += 8;
  else if (input.activity === "inactive") score -= 15;

  const decisionMakers = input.contacts.filter((contact) => contact.seniority === "decision_maker");
  score += Math.min(20, decisionMakers.length * 10);
  if (decisionMakers.some((contact) => contact.email)) score += 10;
  else if (input.emails > 0) score += 5;
  if (input.socials >= 2) score += 10;
  else if (input.socials === 1) score += 5;

  return Math.max(0, Math.min(100, score));
}

function canUseAi() {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function synthesise(input: {
  companyName: string;
  website: string | null;
  research: SiteResearch | null;
  websiteFindings: string[];
  activityEvidence: string;
  mentions: Array<{ title: string; url: string; description: string }>;
  localResults: Array<{ title: string; url: string; description: string }>;
  globalResults: Array<{ title: string; url: string; description: string }>;
  contacts: EnrichedContact[];
  country: string | null;
  listing: { is_public: boolean; exchanges: string[]; ticker: string | null };
  brandFindings: string[];
  domainNotes: string;
  mailNotes: string;
}) {
  const fallback = {
    brief: input.research?.description || `${input.companyName} is a company sourced from a pasted prospect list; public detail was limited, so confirm the business description before outreach.`,
    industry: "",
    country: input.country || "",
    city: "",
    employee_range: "",
    employee_count: 0,
    founded_year: 0,
    countries: [] as string[],
    pain_points: [...input.websiteFindings, ...input.brandFindings, input.domainNotes, input.mailNotes].filter(Boolean).slice(0, 6),
    how_we_help: ["Review the brand and digital experience against the findings above, then propose the smallest change that removes the biggest friction."],
    service_fit: [{ service: "UX/UI Design & Website Development", reason: "The public website is the clearest observable gap." }],
    competitors_local: input.localResults.slice(0, 5).map((entry) => ({ name: entry.title, url: entry.url, note: entry.description })),
    competitors_global: input.globalResults.slice(0, 5).map((entry) => ({ name: entry.title, url: entry.url, note: entry.description })),
    outreach_angle: "Lead with the specific website findings rather than a generic pitch.",
    outreach_subject: `A few notes on ${input.companyName}'s website`,
    outreach_email: "",
    contact_titles: [] as Array<{ full_name: string; seniority: string }>,
  };
  if (!canUseAi()) return fallback;

  const prompt = [
    `Company: ${input.companyName}`,
    input.website ? `Website: ${input.website}` : "Website: none found",
    input.country ? `Stated location: ${input.country}` : "",
    `Activity evidence: ${input.activityEvidence}`,
    `Website findings: ${input.websiteFindings.join(" ") || "none"}`,
    `Brand consistency between the website and the social accounts: ${input.brandFindings.join(" ") || "not assessed"}`,
    `Domain configuration: ${input.domainNotes || "not assessed"}`,
    `Mail configuration: ${input.mailNotes || "not assessed"}`,
    `Homepage summary: ${clip(input.research?.description || input.research?.title, 600)}`,
    `Site text sample: ${clip(input.research?.text, 6000)}`,
    `Stock listing signals read from the site: ${input.listing.is_public ? `${input.listing.exchanges.join(", ") || "investor relations pages present"}${input.listing.ticker ? ` ticker ${input.listing.ticker}` : ""}` : "none found"}`,
    `Named people found publicly: ${input.contacts.map((contact) => `${contact.full_name} (${contact.job_title || "title unknown"})`).join("; ") || "none"}`,
    `Public mentions: ${input.mentions.map((entry) => `${entry.title} - ${entry.description}`).join(" | ").slice(0, 2500)}`,
    `Possible local competitors from search: ${input.localResults.map((entry) => `${entry.title} (${entry.url})`).join("; ").slice(0, 1500)}`,
    `Possible global competitors from search: ${input.globalResults.map((entry) => `${entry.title} (${entry.url})`).join("; ").slice(0, 1500)}`,
    `CDS Space services: ${SERVICE_NAMES.join("; ")}`,
  ].filter(Boolean).join("\n");

  try {
    const { text } = await chatComplete([
      {
        role: "system",
        content: [
          "You are a B2B research analyst at CDS Space, a branding, design, and digital product agency.",
          "You summarise ONLY what the supplied evidence supports. Never invent people, emails, revenue, or client names.",
          "If the evidence does not support a field, return an empty string or an empty array for it.",
          "Each pain point must be a full paragraph of 40 to 90 words, not a headline. State what was observed, where it was observed, what it costs the business in customers, credibility, search visibility or staff time, and who inside the company feels it. Name the page, the platform or the record the evidence came from.",
      "Pain points must be specific to this company and traceable to the supplied evidence. Never write a generic marketing statement that would read the same for any company.",
      "Order the pain points by how much they cost the business, worst first, and return between three and six of them where the evidence supports it.",
      "Each how_we_help entry pairs with the pain point at the same position: say concretely what CDS Space would do, what the company would have at the end, and roughly how quickly.",
          "Every service you recommend must be chosen from the supplied CDS Space service list, verbatim.",
          "Write in plain professional English. Do not use em dashes.",
          "Return only JSON matching: {brief, industry, country, city, countries[], employee_range, employee_count, founded_year, pain_points[], how_we_help[], service_fit[{service, reason}], competitors_local[{name,url,note}], competitors_global[{name,url,note}], outreach_angle, outreach_subject, outreach_email, contact_titles[{full_name, seniority}]}.",
      "countries lists every country the evidence shows the company operates, is registered, or has an office in, including the head office country. Use full country names. Return an empty array when the evidence names none.",
      "employee_count is a whole number staff estimate and must be 0 unless the evidence states or clearly implies a headcount.",
          "contact_titles classifies only the named people supplied, with seniority one of decision_maker, influencer, operational, unknown.",
          "outreach_email is a short first-contact email (110 to 160 words) that names one observed problem, one consequence, and one next step.",
        ].join(" "),
      },
      { role: "user", content: prompt },
    ], { temperature: 0.35, max_tokens: 1800, response_format: { type: "json_object" } });

    const parsed = parseJson(text);
    return {
      brief: clip(parsed.brief, 2000) || fallback.brief,
      industry: clip(parsed.industry, 120),
      country: clip(parsed.country, 120) || input.country || "",
      city: clip(parsed.city, 120),
      employee_range: clip(parsed.employee_range, 60),
      employee_count: Number(parsed.employee_count) || 0,
      founded_year: Number(parsed.founded_year) || 0,
      countries: list(parsed.countries, 40, 60),
      pain_points: list(parsed.pain_points, 8, 1200).length ? list(parsed.pain_points, 8, 1200) : fallback.pain_points,
      how_we_help: list(parsed.how_we_help, 8, 1200).length ? list(parsed.how_we_help, 8, 1200) : fallback.how_we_help,
      service_fit: objectList<{ service: string; reason: string }>(parsed.service_fit, { service: 120, reason: 500 }, 6)
        .filter((entry) => SERVICE_NAMES.includes(entry.service)),
      competitors_local: objectList<{ name: string; url: string; note: string }>(parsed.competitors_local, { name: 160, url: 500, note: 400 }, 8),
      competitors_global: objectList<{ name: string; url: string; note: string }>(parsed.competitors_global, { name: 160, url: 500, note: 400 }, 8),
      outreach_angle: clip(parsed.outreach_angle, 1000) || fallback.outreach_angle,
      outreach_subject: clip(parsed.outreach_subject, 200) || fallback.outreach_subject,
      outreach_email: clip(parsed.outreach_email, 4000),
      contact_titles: objectList<{ full_name: string; seniority: string }>(parsed.contact_titles, { full_name: 160, seniority: 40 }, 20),
    };
  } catch {
    // Research must still produce a usable record when the AI step is unavailable.
    return fallback;
  }
}

const PROFILE_HOSTS: Array<{ host: string; platform: string }> = [
  { host: "linkedin.com", platform: "linkedin" },
  { host: "facebook.com", platform: "facebook" },
  { host: "instagram.com", platform: "instagram" },
  { host: "x.com", platform: "x" },
  { host: "twitter.com", platform: "x" },
  { host: "youtube.com", platform: "youtube" },
  { host: "tiktok.com", platform: "tiktok" },
];

const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

// Placeholder addresses are everywhere: in tutorial snippets, and inside the
// mock screenshots companies put on their own marketing pages. Bolt's site
// publishes "hello@janesbakery.com" in a product mock, which is not a way to
// reach Bolt.
const PLACEHOLDER_DOMAIN = /^(example|test|sample|domain|email|mail|company|yourcompany|yourdomain|acme|mycompany|business|website|site|brand|demo|placeholder)\./;
const FREE_MAIL = /^(gmail|yahoo|hotmail|outlook|live|icloud|aol|protonmail|proton|zoho|yandex|mail|gmx|web)\./;

/**
 * Decides whether an address is plausibly a way to reach this company. It has to
 * sit on the company's own domain, or read like the company's name, or be a free
 * mailbox published on the company's own site, which is how a great many small
 * businesses actually publish contact details.
 */
export function plausibleEmail(
  email: string,
  companyDomain: string | null,
  companyName: string,
  options: { allowFreeMail: boolean },
) {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  if (!domain || PLACEHOLDER_DOMAIN.test(domain)) return false;
  if (companyDomain) {
    const base = companyDomain.replace(/^www\./, "");
    if (domain === base || domain.endsWith(`.${base}`)) return true;
  }
  if (FREE_MAIL.test(domain)) return options.allowFreeMail;
  const label = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  const key = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return label.length > 3 && key.length > 3 && (key.startsWith(label) || label.startsWith(key.slice(0, 8)));
}

/**
 * Last resort for a company with no reachable website. Rather than recording
 * nothing, the open web is searched for the company's social profiles and any
 * publicly published address, so there is still a way to reach it.
 */
async function resolveOnlinePresence(companyName: string, country: string | null, companyDomain: string | null) {
  const scope = `"${companyName}" ${country || ""}`.trim();
  const [profiles, contact] = await Promise.all([
    searchOpenWeb(`${scope} linkedin OR facebook OR instagram`, 12, { includeSocial: true }),
    searchOpenWeb(`${scope} contact email`, 8),
  ]);

  const socials: Array<{ platform: string; url: string }> = [];
  for (const result of profiles) {
    if (isExcludedDomain(result.url)) continue;
    const match = PROFILE_HOSTS.find((entry) => result.domain === entry.host || result.domain.endsWith(`.${entry.host}`));
    // Only keep a profile whose title actually mentions the company, so a
    // search that drifted onto a similarly named account is discarded.
    const named = result.title.toLowerCase().includes(companyName.toLowerCase().split(" ")[0]);
    if (match && named && !socials.some((entry) => entry.platform === match.platform)) {
      socials.push({ platform: match.platform, url: result.url });
    }
  }

  const emails: Array<{ email: string; source_url: string; kind: string }> = [];
  for (const result of [...contact, ...profiles]) {
    for (const found of `${result.title} ${result.description}`.match(EMAIL_IN_TEXT) || []) {
      const email = found.toLowerCase();
      if (/\.(png|jpe?g|gif|webp)$/i.test(email) || emails.some((entry) => entry.email === email)) continue;
      // A search snippet is weak evidence, so a free mailbox is not accepted here.
      if (!plausibleEmail(email, companyDomain, companyName, { allowFreeMail: false })) continue;
      emails.push({ email, source_url: result.url, kind: GENERIC_MAILBOX.test(email) ? "general" : "personal" });
    }
  }

  return { socials: socials.slice(0, 6), emails: emails.slice(0, 6), searched: profiles.length + contact.length > 0 };
}

// Words that carry no identity. "Bank" matching inside "urbankitchengroup" is
// how "Monzo Bank" ends up pointing at a catering company.
const GENERIC_TOKEN = /^(the|and|for|ltd|inc|llc|plc|corp|group|limited|company|technology|technologies|holdings|international|global|services|solutions|bank|banking|capital|partners|ventures|digital|media|studio|studios|agency|consulting|systems|labs|works|industries|enterprises|trading|logistics|foods|energy|health|care|store|shop)$/;

/**
 * Significant words of a company name, with legal forms and filler dropped, used
 * to decide whether a search result is really about this company.
 */
function nameTokens(companyName: string) {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !GENERIC_TOKEN.test(token));
}

/**
 * Rejects a search result whose domain has nothing to do with the company. A
 * search for "Xendit" returns xvideos.com among the results, and without this
 * check that becomes the company's recorded website.
 */
function domainLooksLikeCompany(domain: string, companyName: string) {
  const label = domain.replace(/^www\./, "").split(".")[0].replace(/[^a-z0-9]/g, "");
  if (!label) return false;
  const tokens = nameTokens(companyName);
  const key = tokens.join("");
  if (!key) return false;
  if (label === key) return true;
  // A short or numeric fragment is not distinctive enough: "007 Autohaus" must
  // not resolve to 007.com on the strength of three characters.
  if (label.length >= 4 && (key.startsWith(label) || label.startsWith(key))) return true;
  // Only the leading distinctive word counts. Matching any word lets a generic
  // one hit by accident somewhere inside an unrelated domain.
  const lead = tokens[0];
  return Boolean(lead && lead.length >= 4 && label.includes(lead));
}

const EXCLUDED_RESULT_HOSTS = /wikipedia|linkedin|facebook|crunchbase|bloomberg|yelp|indeed|glassdoor|zoominfo|dnb\.com|pitchbook|owler|tracxn|reuters|forbes/i;

/** Finds the official website for a company that was pasted in without one. */
async function resolveWebsite(companyName: string, country: string | null) {
  const results = await searchOpenWeb(`"${companyName}" ${country || ""} official website`.trim(), 8);
  const candidate = results.find((result) =>
    !isSocialHost(result.domain)
    && !EXCLUDED_RESULT_HOSTS.test(result.domain)
    && !isExcludedDomain(result.domain)
    && domainLooksLikeCompany(result.domain, companyName));
  return candidate ? { website: `https://${candidate.domain}`, domain: candidate.domain, source: candidate.url } : null;
}

/**
 * Full public-source research pass for one company: confirm it is still trading,
 * grade the website, collect socials, emails, and decision makers, map local and
 * global competitors, and turn all of it into an outreach-ready record.
 */
export async function enrichCompany(input: {
  company_name: string;
  domain: string | null;
  website: string | null;
  country: string | null;
  industry: string | null;
}): Promise<EnrichedCompany> {
  const sources: string[] = [];
  let website = input.website;
  let domain = input.domain;

  if (!website) {
    const resolved = await resolveWebsite(input.company_name, input.country);
    if (resolved) {
      website = resolved.website;
      domain = resolved.domain;
      sources.push(resolved.source);
    }
  }

  let research: SiteResearch | null = null;
  let html = "";
  let reachable = false;
  const searchResolved = !input.website;
  if (website) {
    try {
      research = await researchPublicSite(website, true);
      reachable = true;
      sources.push(...research.sources);
      domain = domain || research.domain;
    } catch {
      reachable = false;
    }
    if (reachable) {
      try {
        html = (await fetchPublicPage(website)).html;
      } catch {
        html = "";
      }
      // A site we found by search has to mention the company somewhere before it
      // is treated as theirs. Wrong-company research is worse than none.
      if (searchResolved && research) {
        const haystack = `${research.title} ${research.description} ${research.text}`.toLowerCase();
        const lead = nameTokens(input.company_name)[0];
        // Word boundaries matter here for the same reason they do above.
        const mentioned = lead ? new RegExp(`\\b${lead.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack) : true;
        if (!mentioned) {
          research = null;
          html = "";
          reachable = false;
          website = null;
          domain = input.domain;
        }
      }
    }
  }

  const searchName = `"${input.company_name}"`;
  const [mentions, localResults, globalResults] = await Promise.all([
    searchOpenWeb(`${searchName} ${new Date().getFullYear()} news`, 8),
    searchOpenWeb(`${searchName} competitors ${input.country || ""} ${input.industry || ""}`.trim(), 8),
    searchOpenWeb(`${input.industry || input.company_name} leading global companies competitors`, 8),
  ]);
  sources.push(...mentions.slice(0, 5).map((entry) => entry.url));

  const websiteAssessment = website && reachable
    ? assessWebsite(html, research)
    : {
        status: (website ? "broken" : "missing") as WebsiteStatus,
        score: website ? 15 : 0,
        signals: { ...EMPTY_WEBSITE_SIGNALS },
        findings: [website
          ? "The website did not return a usable page when checked, so customers may be hitting the same failure."
          : "No public website could be found for this company."],
      };

  // The bare host and the www host are checked separately, and the domain's own
  // DNS is read for contact routes, whether or not the site itself loaded.
  const [domainVariants, dnsContacts] = domain
    ? await Promise.all([checkDomainVariants(domain), traceDomainContacts(domain)])
    : [[] as DomainVariant[], [] as DnsContact[]];

  const activity = assessActivity({ reachable, html, mentions });

  // A ticker printed on the company's own site is far stronger evidence of a
  // listing than any model guess, so it is read from the markup first.
  const listing = detectListing(`${html} ${research?.text || ""} ${mentions.map((entry) => `${entry.title} ${entry.description}`).join(" ")}`);

  // An address on the company's own site is good evidence, so a free mailbox is
  // accepted here, but a placeholder from a mock screenshot still is not.
  const publicEmails = (research?.emails || [])
    .filter((entry) => plausibleEmail(entry.email, domain, input.company_name, { allowFreeMail: true }))
    .map((entry) => ({
      email: entry.email,
      source_url: entry.source_url,
      kind: GENERIC_MAILBOX.test(entry.email) ? "general" : "personal",
    }));

  let socialLinks = (research?.socialLinks || []).filter((entry) => !isExcludedDomain(entry.url));

  // Most registry rows arrive with no website at all. When the site could not be
  // found or could not be read, and nothing else turned up a way to reach the
  // company, fall back to searching the open web for its profiles and address.
  let presenceSearched = false;
  if (!socialLinks.length || !publicEmails.length) {
    const presence = await resolveOnlinePresence(input.company_name, input.country, domain);
    presenceSearched = presence.searched;
    if (!socialLinks.length) socialLinks = presence.socials;
    for (const entry of presence.emails) {
      if (!publicEmails.some((existing) => existing.email === entry.email)) publicEmails.push(entry);
    }
  }

  let contacts: EnrichedContact[] = (research?.people || []).map((person) => {
    const emailMatch = publicEmails.find((entry) => {
      const local = entry.email.split("@")[0].toLowerCase().replace(/[^a-z]/g, "");
      const parts = person.name.toLowerCase().split(/\s+/).filter(Boolean);
      return parts.length > 1 && parts.every((part) => local.includes(part.slice(0, 4)));
    });
    return {
      full_name: person.name,
      job_title: person.job_title || null,
      seniority: seniorityFor(person.job_title || ""),
      email: person.email || emailMatch?.email || null,
      email_confidence: (person.email || emailMatch) ? "verified_public" : "unknown",
      phone: null,
      linkedin_url: socialLinks.find((entry) => entry.platform === "linkedin")?.url || null,
      source_url: person.source_url,
    } as EnrichedContact;
  });

  // Brand consistency between the site and each social account.
  const brandConsistency = await assessBrandConsistency({
    companyName: input.company_name,
    siteHtml: html,
    siteUrl: website || "",
    socials: socialLinks,
  }).catch(() => [] as BrandFinding[]);

  const variantFinding = domainVariantFinding(domainVariants);
  if (variantFinding) websiteAssessment.findings.push(variantFinding);
  for (const finding of brandConsistency) {
    if (finding.status === "differs" || finding.status === "missing") websiteAssessment.findings.push(`${finding.area}: ${finding.detail}`);
  }

  const mailWorks = !dnsContacts.some((entry) => entry.kind === "no_mail");
  for (const entry of dnsContacts) {
    if ((entry.kind === "soa_admin" || entry.kind === "txt_email") && !publicEmails.some((existing) => existing.email === entry.value)) {
      publicEmails.push({ email: entry.value, source_url: `dns:${domain}`, kind: "dns" });
    }
  }

  const synthesis = await synthesise({
    companyName: input.company_name,
    website,
    research,
    websiteFindings: websiteAssessment.findings,
    activityEvidence: activity.evidence,
    mentions,
    localResults,
    globalResults,
    contacts,
    country: input.country,
    listing,
    brandFindings: brandConsistency.filter((entry) => entry.status !== "consistent").map((entry) => `${entry.area}: ${entry.detail}`),
    domainNotes: variantFinding || domainVariants.map((entry) => `${entry.host} ${entry.note}`).join("; "),
    mailNotes: dnsContacts.map((entry) => entry.detail).join(" "),
  });

  // The model may read a title the page markup did not label clearly; it can only
  // reclassify people we already found, never add new ones.
  if (synthesis.contact_titles.length) {
    contacts = contacts.map((contact) => {
      const match = synthesis.contact_titles.find((entry) => entry.full_name.toLowerCase() === contact.full_name.toLowerCase());
      const seniority = match?.seniority as EnrichedContact["seniority"] | undefined;
      return seniority && ["decision_maker", "influencer", "operational", "unknown"].includes(seniority)
        ? { ...contact, seniority }
        : contact;
    });
  }

  // A general mailbox is still a route to a decision maker when no named contact exists.
  if (!contacts.some((contact) => contact.email) && publicEmails.length) {
    const general = publicEmails[0];
    contacts.push({
      full_name: "General enquiries",
      job_title: "Published company mailbox",
      seniority: "unknown",
      email: general.email,
      email_confidence: "verified_public",
      phone: null,
      linkedin_url: null,
      source_url: general.source_url,
    });
  }

  // Say plainly what the search did and did not turn up, so the record never
  // implies a company has no presence when we simply could not find one.
  if (!website && presenceSearched) {
    websiteAssessment.findings.push(socialLinks.length
      ? `No website was found, but the company is reachable through ${socialLinks.map((entry) => entry.platform).join(", ")}. Building a site is the obvious first gap.`
      : "No website and no social profiles could be found through an open web search, so this company has no confirmed online presence.");
  }

  const dealScore = scoreDeal({
    website: { status: websiteAssessment.status, score: websiteAssessment.score },
    activity: activity.status,
    contacts,
    socials: socialLinks.length,
    emails: publicEmails.length,
  });

  const foundedYear = synthesis.founded_year > 1700 && synthesis.founded_year <= new Date().getFullYear() ? synthesis.founded_year : null;
  const employeeCount = synthesis.employee_count > 0 && synthesis.employee_count < 5_000_000 ? synthesis.employee_count : null;
  // The head office country leads, then every other country the evidence named.
  const countries = Array.from(new Set([
    normalizeCountry(synthesis.country || input.country),
    ...synthesis.countries.map((entry) => normalizeCountry(entry)),
  ].filter(Boolean) as string[]));

  const competitorsLocal = synthesis.competitors_local.length
    ? synthesis.competitors_local
    : localResults.slice(0, 5).map((entry) => ({ name: entry.title, url: entry.url, note: entry.description }));
  const competitorsGlobal = synthesis.competitors_global.length
    ? synthesis.competitors_global
    : globalResults.slice(0, 5).map((entry) => ({ name: entry.title, url: entry.url, note: entry.description }));

  return {
    company_name: input.company_name,
    domain: domain ? normalizeDomain(domain) : null,
    website: website || null,
    country: synthesis.country || input.country || null,
    city: synthesis.city || null,
    industry: synthesis.industry || input.industry || null,
    employee_range: synthesis.employee_range || null,
    employee_count: employeeCount,
    size_band: sizeBandFor(employeeCount),
    is_public: listing.is_public ? true : null,
    stock_exchanges: listing.exchanges,
    ticker: listing.ticker,
    is_startup: looksLikeStartup({ founded_year: foundedYear, employee_count: employeeCount, is_public: listing.is_public }),
    countries: countries,
    founded_year: foundedYear,
    activity_status: activity.status,
    activity_evidence: activity.evidence,
    website_status: websiteAssessment.status,
    website_score: websiteAssessment.score,
    website_findings: websiteAssessment.findings,
    issues: detectProspectIssues({
      websiteStatus: websiteAssessment.status,
      websiteScore: websiteAssessment.score,
      reachable,
      signals: websiteAssessment.signals,
      brandFindings: brandConsistency,
      socialCount: socialLinks.length,
    }),
    brand_consistency: brandConsistency,
    domain_variants: domainVariants,
    dns_contacts: dnsContacts,
    suggested_mailboxes: domain ? likelyMailboxes(domain, mailWorks) : [],
    socials: socialLinks,
    emails: publicEmails,
    phones: [],
    brief: synthesis.brief,
    pain_points: synthesis.pain_points,
    how_we_help: synthesis.how_we_help,
    service_fit: synthesis.service_fit,
    competitors_local: competitorsLocal,
    competitors_global: competitorsGlobal,
    outreach_angle: synthesis.outreach_angle,
    outreach_subject: synthesis.outreach_subject,
    outreach_email: synthesis.outreach_email,
    deal_score: dealScore,
    priority: dealScore >= 70 ? "high" : dealScore >= 45 ? "medium" : "low",
    sources: Array.from(new Set([...sources, ...socialLinks.map((entry) => entry.url)])).slice(0, 30),
    contacts: contacts.slice(0, 25),
  };
}
