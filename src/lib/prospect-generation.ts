import "server-only";

import { fetchPublicPage, fetchPublicText, isSocialHost, normalizeDomain } from "@/lib/sales-growth-research";
import { companyNameKey, normalizeCountry } from "@/lib/prospect-directory";
import { isExcludedBusiness } from "@/lib/prospect-exclusions";
import { browserConfigured, browserSetupHint, renderPage } from "@/lib/prospect-browser";

export interface CompanyCandidate {
  company_name: string;
  name_key: string;
  domain: string | null;
  website: string | null;
  country: string | null;
  industry: string | null;
  registration_id: string | null;
  note: string | null;
  source_url: string | null;
  // Facts an official register publishes directly. Left null by page harvesting,
  // where the research pass works them out from public evidence instead.
  city?: string | null;
  employee_count?: number | null;
  founded_year?: number | null;
  registry_status?: string | null;
  registry_source?: string | null;
  email?: string | null;
  phone?: string | null;
  is_public?: boolean | null;
  is_startup?: boolean | null;
  ticker?: string | null;
  exchange?: string | null;
}

export interface HarvestResult {
  candidates: CompanyCandidate[];
  sourceUrl: string;
  title: string;
  pagesRead: number;
  warnings: string[];
}

// Hosts that appear on almost every directory page and are never the prospect.
const NOISE_DOMAINS = new Set([
  "google.com", "gstatic.com", "googleapis.com", "googletagmanager.com", "gmail.com", "youtu.be", "youtube.com",
  "bit.ly", "wordpress.com", "wordpress.org", "wix.com", "squarespace.com", "shopify.com", "godaddy.com",
  "cloudflare.com", "amazonaws.com", "github.com", "medium.com", "wikipedia.org", "w3.org", "schema.org",
  "apple.com", "microsoft.com", "adobe.com", "jsdelivr.net", "unpkg.com", "jquery.com", "vercel.app",
  "crunchbase.com", "glassdoor.com", "indeed.com", "yelp.com", "trustpilot.com", "sec.gov", "gov.uk",
]);

const NOISE_NAMES = /^(home|about( us)?|contact( us)?|privacy|privacy policy|terms|terms of use|login|log in|sign in|sign up|register|blog|news|articles|careers|jobs|cookies?|search|menu|next|previous|previous page|next page|first page|last page|page|read more|view more|see all|back|share|download|subscribe|newsletter|advertise|faqs?|help|support|sitemap|copyright|all rights reserved|skip to content|list of companies|corrected|company name|name|website|address|phone|email|country|industry|category|categories|location|locations|business type|type|types|state|states|city|cities|region|regions|filters|filter|sort by|get listed|list your business|try quote request|quote request|contact form|apply now|learn more|show more|load more|results|listings|directory|profile|profiles)$/i;

// A candidate name has to look like a name rather than a sentence. Letters are
// matched by Unicode class, not A to Z, so "Artjarven Metalli Oy" written with
// its real Finnish spelling, or any Norwegian, French or Arabic company name,
// is kept rather than silently dropped from a worldwide directory.
const NAME_SHAPE = /^[\p{L}\p{N}][\p{L}\p{N} .,'&()\-+/@·'']{1,120}$/u;

// Faceted directories label their filters "Businesses (1,238,703)" and their
// helpers "Search By Categories". Neither is a company.
const FURNITURE_SHAPE = /^(\S.*)\s*\(\s*[\d,.]+\s*\)$|^(search|browse|filter|sort|view|find|explore|list|top|best|latest|popular|featured|all)\b.{0,40}$|^\d[\d,.]*$|^[\d,.]+\s*[kmbKMB]\+?$/i;

const MAX_CANDIDATES = 20_000;
const MAX_PAGES = 40;

function titleFromDomain(domain: string) {
  return domain
    .replace(/^www\./, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function cleanName(value: string) {
  return value
    .replace(/["'`‘’“”]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:|\-*•]+|[\s.,;:|\-*•]+$/g, "")
    .trim()
    .slice(0, 180);
}

function domainFrom(value: string) {
  const match = value.match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:\/[^\s,;|]*)?/i);
  if (!match) return null;
  const domain = normalizeDomain(match[1]);
  if (!domain || !domain.includes(".")) return null;
  const tld = domain.split(".").pop() || "";
  if (tld.length < 2 || /^\d+$/.test(tld)) return null;
  if (/\.(png|jpe?g|svg|gif|webp|css|js|pdf|ico|woff2?)$/i.test(domain)) return null;
  return domain;
}

function isNoiseDomain(domain: string) {
  if (NOISE_DOMAINS.has(domain)) return true;
  return Array.from(NOISE_DOMAINS).some((noise) => domain.endsWith(`.${noise}`));
}

export function buildCandidate(name: string, domain: string | null, extras: Partial<CompanyCandidate> = {}): CompanyCandidate | null {
  const company_name = cleanName(name) || (domain ? titleFromDomain(domain) : "");
  if (!company_name || company_name.length < 2) return null;
  if (NOISE_NAMES.test(company_name) || !NAME_SHAPE.test(company_name)) return null;
  if (FURNITURE_SHAPE.test(company_name)) return null;
  if (company_name.split(" ").length > 12) return null;
  if (domain && (isNoiseDomain(domain) || isSocialHost(domain))) return null;
  // Adult, dating and nightlife entries are refused here, which covers every
  // source at once: pasted lists, crawled directories and national registers.
  if (isExcludedBusiness({ name: company_name, domain, industry: extras.industry, description: extras.note })) return null;
  const name_key = companyNameKey(company_name);
  if (!name_key) return null;
  return {
    company_name,
    name_key,
    domain,
    website: domain ? `https://${domain}` : null,
    country: normalizeCountry(extras.country || null),
    industry: extras.industry || null,
    registration_id: extras.registration_id || null,
    note: extras.note || null,
    source_url: extras.source_url || null,
    city: extras.city ?? null,
    employee_count: extras.employee_count ?? null,
    founded_year: extras.founded_year ?? null,
    registry_status: extras.registry_status ?? null,
    registry_source: extras.registry_source ?? null,
    email: extras.email ?? null,
    phone: extras.phone ?? null,
    is_public: extras.is_public ?? null,
    is_startup: extras.is_startup ?? null,
    ticker: extras.ticker ?? null,
    exchange: extras.exchange ?? null,
  };
}

/**
 * Collapses candidates onto one entry per company. A domain wins over a name,
 * and the richest version of a duplicated row is the one that survives, so the
 * same company appearing on several lists never becomes several records.
 */
export function dedupeCandidates(candidates: CompanyCandidate[]) {
  const byDomain = new Map<string, CompanyCandidate>();
  const byName = new Map<string, CompanyCandidate>();
  const countries = new Map<string, Set<string>>();

  const richness = (candidate: CompanyCandidate) =>
    (candidate.domain ? 4 : 0) + (candidate.industry ? 2 : 0) + (candidate.registration_id ? 2 : 0)
    + (candidate.registry_status ? 3 : 0) + (candidate.employee_count ? 2 : 0) + (candidate.founded_year ? 2 : 0)
    + (candidate.email ? 2 : 0) + (candidate.note ? 1 : 0);

  for (const candidate of candidates) {
    const key = candidate.domain ? `d:${candidate.domain}` : `n:${candidate.name_key}`;
    const store = candidate.domain ? byDomain : byName;
    const storeKey = candidate.domain || candidate.name_key;
    const existing = store.get(storeKey);
    if (!existing || richness(candidate) > richness(existing)) store.set(storeKey, candidate);
    if (candidate.country) {
      if (!countries.has(key)) countries.set(key, new Set());
      countries.get(key)!.add(candidate.country);
    }
  }

  // A name-only candidate that also appeared with a domain is the same company.
  // Its countries move across, so a company listed under its bare name in one
  // country registry and under its website in another is one record present in
  // both, not two records.
  for (const candidate of byDomain.values()) {
    if (!byName.has(candidate.name_key)) continue;
    byName.delete(candidate.name_key);
    const from = countries.get(`n:${candidate.name_key}`);
    if (!from) continue;
    const key = `d:${candidate.domain}`;
    if (!countries.has(key)) countries.set(key, new Set());
    for (const country of from) countries.get(key)!.add(country);
  }

  const merged = [...byDomain.values(), ...byName.values()];
  return merged.map((candidate) => {
    const key = candidate.domain ? `d:${candidate.domain}` : `n:${candidate.name_key}`;
    return { candidate, countries: Array.from(countries.get(key) || (candidate.country ? [candidate.country] : [])) };
  });
}

function splitRow(line: string) {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes("|")) return line.split("|");
  if ((line.match(/,/g) || []).length >= 1 && !/^https?:/i.test(line.trim())) return line.split(",");
  if (line.includes(" - ")) return line.split(" - ");
  return [line];
}

/**
 * Reads pasted content: a CSV or TSV paste, a bullet list, a wall of notes, a
 * column of URLs, or a plain list of company names with no websites at all.
 * Anything that cannot be resolved to a plausible company name is dropped.
 */
export function parseCompanyInput(raw: string, defaults: { country?: string | null; source_url?: string | null } = {}): CompanyCandidate[] {
  const candidates: CompanyCandidate[] = [];
  const lines = raw.split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•●]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.length > 400) continue;
    const cells = splitRow(line).map((cell) => cell.trim()).filter(Boolean);
    if (!cells.length) continue;
    const domain = domainFrom(line);
    const nameCell = cells.find((cell) => !domainFrom(cell)) || cells[0];
    const name = domainFrom(nameCell) ? titleFromDomain(domain || "") : nameCell;
    const rest = cells.filter((cell) => cell !== nameCell && !domainFrom(cell));
    const country = rest.find((cell) => Boolean(normalizeCountry(cell)) && cell.split(" ").length <= 3) || defaults.country || null;
    const candidate = buildCandidate(name, domain, {
      country,
      industry: rest.find((cell) => cell !== country && /[a-z]/i.test(cell) && cell.length <= 60) || null,
      registration_id: rest.find((cell) => /^[A-Z]{0,3}[-\s]?\d{5,14}$/.test(cell)) || null,
      note: rest.join(" | ").slice(0, 600) || null,
      source_url: defaults.source_url || null,
    });
    if (candidate) candidates.push(candidate);
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  return candidates;
}

/**
 * Removes site furniture before extraction. Navigation, headers, footers, and
 * sidebars are where "About us", "Club Connect" and "Jobs (228)" live, and none
 * of them are companies. Stripping the regions is far more reliable than trying
 * to blacklist every label a directory invents.
 */
function stripChrome(html: string) {
  let cleaned = html
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside|form|select)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // Elements whose class or id names them as furniture, one nesting level deep.
  cleaned = cleaned.replace(
    /<(div|section|ul|ol)\b[^>]*(?:class|id)=["'][^"']*\b(nav|navbar|menu|header|footer|sidebar|side-bar|breadcrumb|pagination|paginate|cookie|banner|social|share|subscribe|newsletter|filter|facet|tabs)\b[^"']*["'][^>]*>[\s\S]{0,20000}?<\/\1>/gi,
    " ",
  );
  return cleaned;
}

/** Pulls the visible text of every anchor together with its href. */
function anchors(html: string, base: URL) {
  const found: Array<{ text: string; url: string | null }> = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    let url: string | null = null;
    try {
      url = new URL(match[1], base).toString();
    } catch {
      url = null;
    }
    if (text || url) found.push({ text, url });
  }
  return found;
}

/** Cell and list-item text, which is where name-only directories keep companies. */
function cellTexts(html: string) {
  const texts: string[] = [];
  for (const match of html.matchAll(/<(td|th|li|h[2-4]|dt|strong|b)\b[^>]*>([\s\S]{0,300}?)<\/\1>/gi)) {
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (text) texts.push(text);
  }
  return texts;
}

/** Detects a shell page whose content is only assembled in the browser. */
function looksClientRendered(html: string, harvested: number) {
  if (harvested > 0) return false;
  return /__NEXT_DATA__|id="root"|id="app"|ng-app|data-reactroot|window\.__NUXT__/.test(html) || html.length < 4000;
}

function nextPageUrls(html: string, base: URL, page: number) {
  const links = anchors(html, base)
    .filter((anchor) => /^(next|more|›|»|\d{1,4})$/i.test(anchor.text) || /[?&](page|p|pg|start|offset)=/i.test(anchor.url || ""))
    .map((anchor) => anchor.url)
    .filter((url): url is string => Boolean(url) && normalizeDomain(url!) === normalizeDomain(base.toString()));
  const numbered = base.searchParams.has("page") ? [] : [`${base.toString()}${base.search ? "&" : "?"}page=${page + 1}`];
  return Array.from(new Set([...links, ...numbered]));
}

function candidatesFromHtml(rawHtml: string, pageUrl: string, defaults: { country?: string | null }) {
  const html = stripChrome(rawHtml);
  const base = new URL(pageUrl);
  const pageDomain = normalizeDomain(pageUrl);
  const candidates: CompanyCandidate[] = [];

  // Linked entries: the anchor text is the company name, the href its website
  // when it points off-site, or its profile page when it does not.
  for (const anchor of anchors(html, base)) {
    const linkDomain = anchor.url ? normalizeDomain(anchor.url) : "";
    const offSite = Boolean(linkDomain) && linkDomain !== pageDomain && !linkDomain.endsWith(`.${pageDomain}`);
    const name = anchor.text || (offSite ? titleFromDomain(linkDomain) : "");
    if (!name) continue;
    const candidate = buildCandidate(name, offSite ? linkDomain : null, {
      country: defaults.country || null,
      note: `Listed on ${pageUrl}`,
      source_url: anchor.url || pageUrl,
    });
    if (candidate) candidates.push(candidate);
  }

  // Name-only entries: registry and regulator lists publish plain names in table
  // cells or list items with no link at all.
  for (const text of cellTexts(html)) {
    const candidate = buildCandidate(text, domainFrom(text), {
      country: defaults.country || null,
      note: `Listed on ${pageUrl}`,
      source_url: pageUrl,
    });
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

/** Reads company profile URLs out of a sitemap, following sitemap indexes once. */
async function harvestFromSitemap(sitemapUrl: string, defaults: { country?: string | null }) {
  const xml = await fetchPublicText(sitemapUrl);
  const locations = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((match) => match[1]);
  const isIndex = /<sitemapindex/i.test(xml);
  const candidates: CompanyCandidate[] = [];
  let read = 1;

  const pages = isIndex ? locations.slice(0, 10) : [];
  for (const page of pages) {
    try {
      const child = await fetchPublicText(page);
      locations.push(...Array.from(child.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((match) => match[1]));
      read += 1;
    } catch {
      // One unreadable child sitemap should not discard the rest.
    }
  }

  for (const location of locations) {
    if (/\.xml($|\?)/i.test(location)) continue;
    const slug = location.replace(/\/$/, "").split("/").pop() || "";
    if (!slug || slug.length < 3) continue;
    const name = slug.replace(/[-_]+/g, " ").replace(/\.(html?|php|aspx?)$/i, "").replace(/\b\w/g, (letter) => letter.toUpperCase());
    const candidate = buildCandidate(name, null, { country: defaults.country || null, note: `Sitemap entry of ${sitemapUrl}`, source_url: location });
    if (candidate) candidates.push(candidate);
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return { candidates, read };
}

/**
 * Crawls a pasted listing, directory, or registry page and returns every company
 * it can read, following pagination up to a page cap. Sitemap URLs are handled
 * directly, which is often the only way to enumerate a large directory.
 */
export async function harvestFromUrl(
  url: string,
  options: { country?: string | null; maxPages?: number; render?: boolean; scrolls?: number; clickSelector?: string } = {},
): Promise<HarvestResult> {
  const warnings: string[] = [];
  const defaults = { country: options.country || null };

  if (/sitemap[^/]*\.xml($|\?)/i.test(url)) {
    const { candidates, read } = await harvestFromSitemap(url, defaults);
    if (!candidates.length) warnings.push("The sitemap contained no readable company entries.");
    return { candidates, sourceUrl: url, title: "Sitemap import", pagesRead: read, warnings };
  }

  const maxPages = Math.max(1, Math.min(MAX_PAGES, options.maxPages || 5));
  const useBrowser = Boolean(options.render);
  if (useBrowser && !browserConfigured()) throw new Error(browserSetupHint());

  const read = async (target: string) => {
    if (!useBrowser) return fetchPublicPage(target);
    const rendered = await renderPage(target, { scrolls: options.scrolls, clickSelector: options.clickSelector });
    return { url: rendered.url, title: rendered.title, html: rendered.html, text: "", links: [] };
  };

  let first = await read(url);
  let collected = candidatesFromHtml(first.html, first.url, defaults);
  let pagesRead = 1;

  // A shell page carries no list until a browser runs its scripts. Rather than
  // reporting an empty import, retry through the browser when one is connected.
  if (!useBrowser && looksClientRendered(first.html, collected.length)) {
    if (browserConfigured()) {
      const rendered = await renderPage(url, { scrolls: options.scrolls, clickSelector: options.clickSelector });
      first = { url: rendered.url, title: rendered.title, html: rendered.html, text: "", links: [] };
      collected = candidatesFromHtml(first.html, first.url, defaults);
      warnings.push("This page builds its list in the browser, so it was read through the connected browser instead.");
    } else {
      warnings.push(`This page builds its list in the browser, so the served HTML carries no company data. ${browserSetupHint()}`);
    }
  }

  if (collected.length && maxPages > 1) {
    const queue = nextPageUrls(first.html, new URL(first.url), 1);
    const seen = new Set([first.url]);
    for (const nextUrl of queue) {
      if (pagesRead >= maxPages) break;
      if (seen.has(nextUrl)) continue;
      seen.add(nextUrl);
      try {
        const page = await read(nextUrl);
        const found = candidatesFromHtml(page.html, page.url, defaults);
        pagesRead += 1;
        // A page that repeats the previous one means pagination has run out.
        if (!found.length) break;
        collected.push(...found);
        queue.push(...nextPageUrls(page.html, new URL(page.url), pagesRead).filter((candidate) => !seen.has(candidate)));
      } catch {
        break;
      }
      if (collected.length >= MAX_CANDIDATES) break;
    }
    if (pagesRead >= maxPages) warnings.push(`Stopped after ${pagesRead} pages. Import the later pages by pasting their URLs.`);
  }

  if (!collected.length && !warnings.length) {
    warnings.push("No company entries could be read from that page.");
  }

  return { candidates: collected.slice(0, MAX_CANDIDATES), sourceUrl: first.url, title: first.title, pagesRead, warnings };
}
