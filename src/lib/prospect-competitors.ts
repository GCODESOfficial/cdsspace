export type CompetitorType = "direct" | "indirect";

export interface ProspectCompetitor {
  name: string;
  url: string;
  note: string;
  type: CompetitorType;
}

export interface CompetitorSearchResult {
  title: string;
  url: string;
  description: string;
  domain?: string;
  type: CompetitorType;
}

const NON_COMPANY_HOSTS = [
  "bing.com", "google.com", "yahoo.com", "wikipedia.org", "linkedin.com", "facebook.com",
  "instagram.com", "twitter.com", "x.com", "youtube.com", "tiktok.com", "crunchbase.com",
  "pitchbook.com", "zoominfo.com", "dnb.com", "owler.com", "craft.co", "similarweb.com",
  "tracxn.com", "cbinsights.com", "bloomberg.com", "reuters.com", "forbes.com", "glassdoor.com",
  "indeed.com", "businesswire.com", "prnewswire.com", "companiesmarketcap.com", "marketbeat.com",
  "comparably.com", "gartner.com", "g2.com", "capterra.com", "trustpilot.com", "yelp.com", "reddit.com",
];

const PAGE_TITLE_NOISE = /^(?:about|careers?|jobs?|login|log in|sign[ -]?on|portal|homepage|contact|news|investor relations|support|help)\b/i;
const LIST_RESULT_NOISE = /\b(?:top|best)\s+\d+\b|\bcompetitors? (?:and|or|&) alternatives?\b|\balternatives? to\b|\bcompanies like\b|\blist of\b|\bwho (?:are|is)\b/i;
const PATH_RESULT_NOISE = /\/(?:blog|blogs|article|articles|news|press|careers?|jobs?|rankings?|compare|comparison|competitors?|alternatives?)(?:\/|$)/i;
const LEGAL_SUFFIX = /\b(?:incorporated|inc|limited|ltd|llc|plc|corp(?:oration)?|company|co|group|holdings?)\b/g;

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function hostOf(value: string) {
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function httpUrl(value: string) {
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function companyKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&amp;|&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domainBrand(value: string) {
  const host = hostOf(value);
  const first = host.split(".")[0] || "";
  return companyKey(first.replace(/[-_]+/g, " "));
}

function sameOrChildDomain(left: string, right: string) {
  return Boolean(left && right && (left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)));
}

function isBlockedHost(host: string) {
  return NON_COMPANY_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function isOwnBrand(name: string, targetName: string, targetDomain: string) {
  const candidate = companyKey(name);
  const target = companyKey(targetName);
  const targetBrand = domainBrand(targetDomain);
  if (!candidate) return true;
  if (target && (candidate === target || candidate.startsWith(`${target} `) || target.startsWith(`${candidate} `))) return true;
  return Boolean(targetBrand.length >= 4 && (candidate === targetBrand || candidate.startsWith(`${targetBrand} `)));
}

function cleanResultName(title: string) {
  const compact = cleanText(title, 200);
  const asciiSeparators = compact
    .replaceAll(String.fromCharCode(8211), " - ")
    .replaceAll(String.fromCharCode(8212), " - ");
  // Search titles usually put the company before a separator and the page title
  // after it. Keeping only that first segment turns an official result into a
  // company candidate instead of storing a page headline as a company name.
  return cleanText(asciiSeparators.split(/\s+(?:\||-|:)\s+|:\s+/)[0], 160);
}

function domainLooksLikeCompany(host: string, name: string) {
  const domainText = host.split(".").slice(0, -1).join("").replace(/[^a-z0-9]/g, "");
  const tokens = companyKey(name).split(" ").filter((token) => token.length >= 4);
  return tokens.some((token) => domainText.includes(token));
}

function competitorType(value: unknown, note: string, fallback: CompetitorType): CompetitorType {
  const type = cleanText(value, 20).toLowerCase();
  if (type === "direct" || type === "indirect") return type;
  if (/\bindirect\b/i.test(note)) return "indirect";
  if (/\bdirect\b/i.test(note)) return "direct";
  return fallback;
}

export function competitorIdentity(entry: Pick<ProspectCompetitor, "name" | "url">) {
  return hostOf(entry.url) || companyKey(entry.name);
}

/**
 * Converts official-company-looking search results into cautious fallback
 * candidates. Articles, directories, social profiles and comparison pages are
 * evidence for the AI pass, but are never presented to users as companies.
 */
export function competitorsFromSearch(
  results: CompetitorSearchResult[],
  target: { companyName: string; domain?: string | null; website?: string | null },
  max = 8,
): ProspectCompetitor[] {
  const targetDomain = hostOf(target.domain || target.website || "");
  const candidates = results.flatMap((result) => {
    const url = httpUrl(result.url);
    const host = hostOf(url);
    const name = cleanResultName(result.title);
    let pathname = "";
    try { pathname = new URL(url).pathname; } catch { pathname = ""; }
    if (!url || !host || isBlockedHost(host) || sameOrChildDomain(host, targetDomain)) return [];
    if (!name || PAGE_TITLE_NOISE.test(name) || LIST_RESULT_NOISE.test(result.title)) return [];
    if (PATH_RESULT_NOISE.test(pathname) || !domainLooksLikeCompany(host, name) || isOwnBrand(name, target.companyName, targetDomain)) return [];
    return [{ name, url, note: cleanText(result.description, 500), type: result.type }];
  });
  return sanitizeCompetitors(candidates, target, "direct", max);
}

/**
 * Treats competitor data as untrusted research output. It removes the prospect
 * itself, non-company sources and duplicates, and normalises the relationship
 * label before the data reaches storage, exports, checklists or the UI.
 */
export function sanitizeCompetitors(
  value: unknown,
  target: { companyName: string; domain?: string | null; website?: string | null },
  fallbackType: CompetitorType = "direct",
  max = 8,
  excluded: Iterable<string> = [],
): ProspectCompetitor[] {
  if (!Array.isArray(value)) return [];
  const targetDomain = hostOf(target.domain || target.website || "");
  const seen = new Set(excluded);
  const output: ProspectCompetitor[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const name = cleanText(entry.name, 160);
    const url = httpUrl(cleanText(entry.url, 500));
    const note = cleanText(entry.note, 500);
    const host = hostOf(url);
    if (!name || !url || !host.includes(".") || isBlockedHost(host) || sameOrChildDomain(host, targetDomain)) continue;
    if (PAGE_TITLE_NOISE.test(name) || LIST_RESULT_NOISE.test(name) || isOwnBrand(name, target.companyName, targetDomain)) continue;
    const identity = host || companyKey(name);
    const nameIdentity = companyKey(name);
    if (!identity || seen.has(identity) || seen.has(nameIdentity)) continue;
    seen.add(identity);
    seen.add(nameIdentity);
    output.push({ name, url, note, type: competitorType(entry.type || entry.relationship, note, fallbackType) });
    if (output.length >= max) break;
  }
  return output;
}

export function sanitizeCompanyCompetitors<T extends Record<string, unknown>>(company: T): T {
  const target = {
    companyName: cleanText(company.company_name, 160),
    domain: cleanText(company.domain, 500),
    website: cleanText(company.website, 500),
  };
  // Geography describes market reach; type describes how the company threatens
  // adoption. Preserve both axes and keep a company from appearing twice.
  const local = sanitizeCompetitors(company.competitors_local, target, "direct");
  const global = sanitizeCompetitors(
    company.competitors_global,
    target,
    "direct",
    8,
    local.flatMap((entry) => [competitorIdentity(entry), companyKey(entry.name)]),
  );
  return { ...company, competitors_local: local, competitors_global: global };
}
