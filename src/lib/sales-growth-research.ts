import "server-only";

import dns from "node:dns/promises";
import net from "node:net";

export interface WebSearchResult {
  title: string;
  url: string;
  description: string;
  domain: string;
}

export interface PublicPerson {
  name: string;
  job_title: string;
  email: string | null;
  source_url: string;
}

export interface SiteResearch {
  domain: string;
  title: string;
  description: string;
  text: string;
  sources: string[];
  emails: Array<{ email: string; source_url: string }>;
  people: PublicPerson[];
  clientSignals: Array<{ name: string; domain: string; source_url: string; evidence: string }>;
  brandSignals: string[];
  socialLinks: Array<{ platform: string; url: string }>;
  technicalMetrics: {
    page_title_length: number;
    meta_description_length: number;
    internal_link_count: number;
    total_link_count: number;
    heading_count: number;
    image_count: number;
    script_count: number;
    visible_text_characters: number;
  };
}

/**
 * Several public registries, the SEC among them, reject or throttle crawlers that
 * do not identify a contact address. Set RESEARCH_CONTACT_EMAIL so those sources
 * stay reachable; the fallback keeps the agency site as the point of contact.
 */
function researchUserAgent() {
  const contact = (process.env.RESEARCH_CONTACT_EMAIL || "").trim();
  return `CDSSpace-MarketResearch/1.0 (+https://cdsspace.pro${contact ? `; ${contact}` : ""})`;
}

const SOCIAL_HOSTS = new Set([
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "youtube.com",
  "tiktok.com", "pinterest.com", "whatsapp.com", "wa.me", "threads.net",
]);

function decodeHtml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value: string) {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function normalDomain(input: string) {
  try {
    const value = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isPrivateIp(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(address)) {
    const ip = address.toLowerCase();
    return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:");
  }
  return true;
}

async function assertPublicUrl(input: string) {
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only public HTTP(S) websites can be researched.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || net.isIP(host)) throw new Error("Private network addresses cannot be researched.");
  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) throw new Error("Private network addresses cannot be researched.");
  return url;
}

async function fetchHtml(input: string) {
  let url = await assertPublicUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9_000);
  try {
    for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": researchUserAgent(), "Accept": "text/html,application/xhtml+xml" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || redirectCount === 4) throw new Error("Website redirected too many times.");
        url = await assertPublicUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Website responded ${response.status}.`);
      const type = response.headers.get("content-type") || "";
      if (!type.includes("text/html") && !type.includes("application/xhtml")) throw new Error("Website did not return an HTML page.");
      const reader = response.body?.getReader();
      if (!reader) return "";
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < 600_000) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        chunks.push(value);
      }
      return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
    }
    throw new Error("Website redirected too many times.");
  } finally {
    clearTimeout(timer);
  }
}

function extractMeta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]).trim();
  }
  return "";
}

function pageTitle(html: string) {
  return extractMeta(html, "og:title") || stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function hrefs(html: string, base: URL) {
  const values: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    try {
      const url = new URL(decodeHtml(match[1]), base);
      if (['http:', 'https:'].includes(url.protocol)) values.push(url.toString());
    } catch {
      // Ignore malformed links.
    }
  }
  return Array.from(new Set(values));
}

function collectPeople(html: string, sourceUrl: string): PublicPerson[] {
  const people: PublicPerson[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const root = JSON.parse(decodeHtml(match[1]));
      const queue = Array.isArray(root) ? [...root] : [root];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        if (Array.isArray(item['@graph'])) queue.push(...item['@graph']);
        const type = item['@type'];
        if (type === "Person" || (Array.isArray(type) && type.includes("Person"))) {
          const name = String(item.name || "").trim();
          if (name) people.push({
            name,
            job_title: String(item.jobTitle || item.roleName || "").trim(),
            email: String(item.email || "").replace(/^mailto:/i, "").trim() || null,
            source_url: sourceUrl,
          });
        }
      }
    } catch {
      // Invalid JSON-LD is common and should not abort research.
    }
  }
  return people;
}

function emailsIn(html: string) {
  const text = decodeHtml(html);
  const found = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(found.map((email) => email.toLowerCase()).filter((email) => !/example\.(com|org)|sentry|wixpress/i.test(email))));
}

export async function searchOpenWeb(
  query: string,
  limit = 10,
  options: { includeSocial?: boolean } = {},
): Promise<WebSearchResult[]> {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query.slice(0, 240));
  url.searchParams.set("format", "rss");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": researchUserAgent() } });
    if (!response.ok) return [];
    const xml = await response.text();
    const results: WebSearchResult[] = [];
    for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const body = item[1];
      const title = stripHtml(body.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
      const link = decodeHtml(body.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim();
      const description = stripHtml(body.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "");
      const domain = normalDomain(link);
      // Social results are noise when researching a website, but they are the
      // whole point when a company has no site and we need a way to reach it.
      if (!title || !domain) continue;
      if (SOCIAL_HOSTS.has(domain) && !options.includeSocial) continue;
      results.push({ title, url: link, description, domain });
      if (results.length >= limit) break;
    }
    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function researchPublicSite(input: string, deep = false): Promise<SiteResearch> {
  const base = await assertPublicUrl(input);
  const rootUrl = `${base.protocol}//${base.host}/`;
  const rootHtml = await fetchHtml(rootUrl);
  const allLinks = hrefs(rootHtml, base);
  const internal = allLinks.filter((value) => normalDomain(value) === normalDomain(rootUrl));
  const useful = internal.filter((value) => /\/(about|team|leadership|contact|work|portfolio|case-stud|clients?)(\/|$|\?)/i.test(new URL(value).pathname));
  const pageUrls = deep ? Array.from(new Set([rootUrl, ...useful])).slice(0, 5) : [rootUrl];
  const pages: Array<{ url: string; html: string }> = [{ url: rootUrl, html: rootHtml }];
  for (const pageUrl of pageUrls.slice(1)) {
    try {
      pages.push({ url: pageUrl, html: await fetchHtml(pageUrl) });
    } catch {
      // A secondary page failing should not discard the homepage research.
    }
  }

  const people: PublicPerson[] = [];
  const socialLinks: Array<{ platform: string; url: string }> = [];
  const emails: Array<{ email: string; source_url: string }> = [];
  const clientSignals: SiteResearch['clientSignals'] = [];
  for (const page of pages) {
    people.push(...collectPeople(page.html, page.url));
    for (const link of hrefs(page.html, new URL(page.url))) {
      const domain = normalDomain(link);
      if (SOCIAL_HOSTS.has(domain)) socialLinks.push({ platform: domain.replace(/\.(com|net)$/, ""), url: link });
    }
    emails.push(...emailsIn(page.html).map((email) => ({ email, source_url: page.url })));
    if (/\/(work|portfolio|case-stud|clients?)(\/|$|\?)/i.test(new URL(page.url).pathname)) {
      for (const link of hrefs(page.html, new URL(page.url))) {
        const domain = normalDomain(link);
        if (!domain || domain === normalDomain(rootUrl) || SOCIAL_HOSTS.has(domain)) continue;
        clientSignals.push({
          name: domain.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
          domain,
          source_url: page.url,
          evidence: "Linked from a public work, portfolio, client, or case-study page; review the source before outreach.",
        });
      }
    }
  }

  const title = pageTitle(rootHtml) || normalDomain(rootUrl);
  const description = extractMeta(rootHtml, "description") || extractMeta(rootHtml, "og:description");
  const text = pages.map((page) => `${page.url}\n${stripHtml(page.html)}`).join("\n\n").slice(0, 24_000);
  const brandSignals: string[] = [];
  if (/twitter[-_ ]?(?:bird|logo|icon)|(?:bird|logo|icon)[-_ ]?twitter|fa-twitter/i.test(rootHtml)) {
    brandSignals.push("The website markup references a legacy Twitter logo or bird asset; visually confirm it before citing this finding.");
  } else if (/https?:\/\/(?:www\.)?twitter\.com\//i.test(rootHtml)) {
    brandSignals.push("The website still links to twitter.com; confirm whether the visible icon and naming have been updated to X.");
  }
  if (!description) brandSignals.push("The homepage does not expose a standard meta description.");
  if (!title) brandSignals.push("The homepage does not expose a clear page title.");
  const rootText = stripHtml(rootHtml);
  const technicalMetrics = {
    page_title_length: title.length,
    meta_description_length: description.length,
    internal_link_count: internal.length,
    total_link_count: allLinks.length,
    heading_count: (rootHtml.match(/<h[1-6]\b/gi) || []).length,
    image_count: (rootHtml.match(/<img\b/gi) || []).length,
    script_count: (rootHtml.match(/<script\b/gi) || []).length,
    visible_text_characters: rootText.length,
  };
  if (technicalMetrics.total_link_count > 140 || technicalMetrics.internal_link_count > 90) {
    brandSignals.push(`The homepage exposes ${technicalMetrics.total_link_count} links (${technicalMetrics.internal_link_count} internal), which may indicate an overly complex navigation or content structure; confirm through human review.`);
  }
  if (technicalMetrics.visible_text_characters > 20_000 || technicalMetrics.script_count > 45) {
    brandSignals.push(`The homepage contains approximately ${technicalMetrics.visible_text_characters} visible text characters and ${technicalMetrics.script_count} scripts, a possible digital-experience complexity signal that requires visual and performance review.`);
  }
  const uniqueEmails = Array.from(new Map(emails.map((entry) => [entry.email, entry])).values()).slice(0, 12);
  const uniquePeople = Array.from(new Map(people.map((entry) => [`${entry.name.toLowerCase()}|${entry.job_title.toLowerCase()}`, entry])).values()).slice(0, 20);
  const uniqueSignals = Array.from(new Map(clientSignals.map((entry) => [entry.domain, entry])).values()).slice(0, 20);
  return {
    domain: normalDomain(rootUrl),
    title,
    description,
    text,
    sources: pages.map((page) => page.url),
    emails: uniqueEmails,
    people: uniquePeople,
    clientSignals: uniqueSignals,
    brandSignals,
    socialLinks: Array.from(new Map(socialLinks.map((entry) => [entry.platform, entry])).values()).slice(0, 12),
    technicalMetrics,
  };
}

/**
 * Fetches one public page and returns its text and outbound links. Prospect
 * generation uses this to harvest company candidates from a pasted directory or
 * listing URL without repeating the SSRF and content-type guards above.
 */
export async function fetchPublicPage(input: string): Promise<{ url: string; title: string; html: string; text: string; links: string[] }> {
  const url = await assertPublicUrl(input);
  const html = await fetchHtml(url.toString());
  return {
    url: url.toString(),
    title: pageTitle(html),
    html,
    text: stripHtml(html).slice(0, 60_000),
    links: hrefs(html, url),
  };
}

/**
 * Fetches a public URL that is not necessarily HTML. Sitemaps are XML, and the
 * HTML-only guard in fetchHtml would reject them.
 */
export async function fetchPublicText(input: string, maxBytes = 4_000_000): Promise<string> {
  const url = await assertPublicUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": researchUserAgent(), "Accept": "application/xml,text/xml,text/html,text/plain" },
    });
    if (!response.ok) throw new Error(`Source responded ${response.status}.`);
    const type = response.headers.get("content-type") || "";
    if (!/(xml|html|text|json)/i.test(type)) throw new Error("Source did not return a text document.");
    const body = await response.text();
    return body.slice(0, maxBytes);
  } finally {
    clearTimeout(timer);
  }
}

/** Exposes the SSRF guard so other harvesters validate URLs the same way. */
export async function assertPublicHttpUrl(input: string) {
  return assertPublicUrl(input);
}

export function isSocialHost(value: string) {
  return SOCIAL_HOSTS.has(normalDomain(value));
}

export function normalizeDomain(value: string) {
  return normalDomain(value);
}
