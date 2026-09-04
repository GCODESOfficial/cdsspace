/**
 * Real-time hunt for a way to email a company.
 *
 * Enrichment already collects addresses as a by-product of researching a
 * company, but it is deliberately shallow: it looks at the homepage and a
 * couple of search snippets, because it runs across the whole directory. This
 * runs for one company, on demand, and goes as wide as a person would - the
 * company's own contact and careers pages, press and news coverage, job posts,
 * investor and annual-report pages, and PDF material such as flyers and
 * brochures.
 *
 * Everything it returns is an address a human could have found by reading a
 * public page. Nothing is guessed from a name pattern: a made-up address that
 * bounces is worse than reporting that none was found.
 */

import { fetchPublicPage, searchOpenWeb } from "@/lib/sales-growth-research";
import { GENERIC_MAILBOX, plausibleEmail } from "@/lib/prospect-enrichment";
import { isExcludedDomain } from "@/lib/prospect-exclusions";

export interface HuntedEmail {
  email: string;
  /** The page the address was actually read from. */
  source_url: string;
  /** Matches the shape enrichment already stores on the company row. */
  kind: string;
  /** Which angle turned it up, so a reviewer can judge it at a glance. */
  channel: string;
  /** Whether the address sits on the company's own domain. */
  on_domain: boolean;
}

export interface HuntReport {
  emails: HuntedEmail[];
  /** Every page actually opened, so the search is auditable. */
  visited: string[];
  /** Angles that were searched, whether or not they produced anything. */
  channels: string[];
  /** True when the hunt stopped because it ran out of time rather than pages. */
  exhausted: boolean;
}

const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** Pages on a company's own site that carry addresses often enough to be worth opening. */
const CONTACT_PATH = /\/(contact|contact-us|about|about-us|team|people|leadership|management|staff|impressum|legal-notice|support|help|customer-service|careers?|jobs|vacancies|recruit|work-with-us|press|media|newsroom|news|investor|investors|investor-relations|annual-report|reports|enquir|sales|partners|suppliers?)(\/|$|\?|#)/i;

/**
 * The angles searched on the open web. Each is a different kind of document
 * that tends to carry a real, monitored address.
 */
function searchAngles(companyName: string, domain: string | null, country: string | null) {
  const scope = `"${companyName}"${country ? ` ${country}` : ""}`;
  const site = domain ? domain.replace(/^www\./, "") : null;
  const angles: Array<{ channel: string; query: string }> = [
    { channel: "contact page", query: `${scope} contact email address` },
    { channel: "press and news", query: `${scope} press release "media contact" email` },
    { channel: "job posts", query: `${scope} careers job vacancy "send your CV" OR "apply" email` },
    { channel: "reports and filings", query: `${scope} annual report investor relations contact email` },
    { channel: "brochures and flyers", query: `${scope} brochure OR flyer OR catalogue filetype:pdf email` },
    { channel: "directories", query: `${scope} company profile telephone email address` },
  ];
  if (site) {
    angles.unshift({ channel: "own domain", query: `"@${site}" email contact` });
    angles.push({ channel: "own site", query: `site:${site} contact email` });
  }
  return angles;
}

/** Addresses inside one document, both in `mailto:` links and in the visible text. */
function extractEmails(html: string, text: string) {
  const found = new Set<string>();
  for (const match of html.matchAll(/mailto:([^"'>?\s]+)/gi)) {
    const value = decodeURIComponent(match[1]).toLowerCase().trim();
    if (value.includes("@")) found.add(value);
  }
  for (const match of `${text}`.match(EMAIL_IN_TEXT) || []) found.add(match.toLowerCase());
  return Array.from(found);
}

/**
 * Rejects the addresses that are technically well-formed but are never a way to
 * reach the company: tracking and error-reporting mailboxes injected by the
 * platforms sites are built on, and image filenames that parse as addresses.
 */
const NOISE = /(sentry|wixpress|\.png|\.jpe?g|\.gif|\.webp|\.svg|@sentry\.|@example\.|@email\.|@domain\.|godaddy|squarespace|wordpress|namecheap|cloudflare)/i;

export async function huntCompanyEmails(input: {
  companyName: string;
  domain: string | null;
  website: string | null;
  country: string | null;
  /** Wall-clock ceiling. The route has its own limit; this keeps us inside it. */
  budgetMs?: number;
}): Promise<HuntReport> {
  const deadline = Date.now() + (input.budgetMs ?? 70_000);
  const outOfTime = () => Date.now() > deadline;

  const emails: HuntedEmail[] = [];
  const visited: string[] = [];
  const seen = new Set<string>();
  const base = input.domain ? input.domain.replace(/^www\./, "").toLowerCase() : null;

  const record = (raw: string, sourceUrl: string, channel: string) => {
    const email = raw.toLowerCase().trim().replace(/^mailto:/, "").split("?")[0];
    if (!email.includes("@") || NOISE.test(email)) return;
    if (seen.has(email)) return;
    // A free mailbox is accepted here: read off a real page it is often exactly
    // how a smaller company publishes its contact details.
    if (!plausibleEmail(email, input.domain, input.companyName, { allowFreeMail: true })) return;
    seen.add(email);
    const host = email.split("@")[1] || "";
    emails.push({
      email,
      source_url: sourceUrl,
      kind: GENERIC_MAILBOX.test(email) ? "general" : "personal",
      channel,
      on_domain: Boolean(base) && (host === base || host.endsWith(`.${base}`)),
    });
  };

  /** Opens one page and reads every address off it. Failures are expected and ignored. */
  const readPage = async (url: string, channel: string) => {
    if (outOfTime() || visited.includes(url) || visited.length >= 24) return [] as string[];
    try {
      const page = await fetchPublicPage(url);
      visited.push(url);
      for (const email of extractEmails(page.html, page.text)) record(email, page.url, channel);
      return page.links;
    } catch {
      return [] as string[];
    }
  };

  // 1. The company's own site, homepage first, then the pages that carry
  //    addresses. This is the only place an address can be trusted outright.
  const root = input.website || (input.domain ? `https://${input.domain}/` : null);
  if (root) {
    const links = await readPage(root, "own site");
    const ownHost = (() => { try { return new URL(root).hostname.replace(/^www\./, ""); } catch { return null; } })();
    const internal = links.filter((link) => {
      try {
        const parsed = new URL(link);
        return parsed.hostname.replace(/^www\./, "") === ownHost && CONTACT_PATH.test(parsed.pathname);
      } catch { return false; }
    });
    for (const link of Array.from(new Set(internal)).slice(0, 8)) {
      if (outOfTime()) break;
      await readPage(link, "own site");
    }
  }

  // 2. The open web, one angle at a time. Snippets are scanned first because
  //    they are free, then the most promising pages are actually opened.
  const angles = searchAngles(input.companyName, input.domain, input.country);
  const channels: string[] = [];
  for (const angle of angles) {
    if (outOfTime()) break;
    channels.push(angle.channel);
    const results = await searchOpenWeb(angle.query, 8);
    const worthOpening: string[] = [];
    for (const result of results) {
      if (isExcludedDomain(result.url)) continue;
      for (const email of `${result.title} ${result.description}`.match(EMAIL_IN_TEXT) || []) {
        record(email, result.url, angle.channel);
      }
      // A snippet is truncated, so the page behind it is worth reading even
      // when the snippet showed nothing.
      if (worthOpening.length < 3) worthOpening.push(result.url);
    }
    for (const url of worthOpening) {
      if (outOfTime()) break;
      await readPage(url, angle.channel);
    }
  }

  // On-domain addresses first, then named people, then anything else: that is
  // the order a person would try them in.
  emails.sort((a, b) => {
    if (a.on_domain !== b.on_domain) return a.on_domain ? -1 : 1;
    if ((a.kind === "personal") !== (b.kind === "personal")) return a.kind === "personal" ? -1 : 1;
    return a.email.localeCompare(b.email);
  });

  return { emails: emails.slice(0, 40), visited, channels, exhausted: outOfTime() };
}
