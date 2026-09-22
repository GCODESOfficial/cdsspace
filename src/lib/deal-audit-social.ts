import "server-only";

import { searchOpenWeb } from "@/lib/sales-growth-research";
import { browserConfigured, renderPage } from "@/lib/prospect-browser";

/**
 * "No social presence was identified" is not a finding, it is the absence of
 * one. An audit that says it has to be able to say where it looked.
 *
 * This checks every platform a buyer would try, by four routes: the links the
 * website publishes about itself across the pages crawled, the links a real
 * browser sees after the page has run its scripts and been scrolled (optional,
 * and only when one is connected), the profiles earlier research already
 * recorded, and a targeted web search per platform.
 *
 * What it reports is DISCOVERABILITY, never existence. A search engine and a
 * server-side page fetch cannot prove that an account does not exist anywhere -
 * a large brand can run busy channels and still publish no link to them, and
 * that is exactly what testing against real sites showed. So a platform with
 * nothing found is recorded as "no profile discoverable", with the routes that
 * were tried. That claim is true, checkable, and is itself worth reporting: a
 * channel a customer cannot find from the website or a search is not doing the
 * brand any work, whether or not it exists.
 */

export const AUDITED_PLATFORMS: Array<{ platform: string; label: string; host: string; matters: string }> = [
  { platform: "linkedin", label: "LinkedIn", host: "linkedin.com", matters: "Where buyers, partners and candidates check that a company is real and currently trading." },
  { platform: "facebook", label: "Facebook", host: "facebook.com", matters: "Still the default place a general audience looks for location, hours and recent activity." },
  { platform: "instagram", label: "Instagram", host: "instagram.com", matters: "Carries the visual identity, and is often the first brand impression for a younger audience." },
  { platform: "x", label: "X", host: "x.com", matters: "Where announcements, incidents and support conversations are expected to surface quickly." },
  { platform: "youtube", label: "YouTube", host: "youtube.com", matters: "Explains a product faster than a page of copy, and is indexed by search." },
  { platform: "tiktok", label: "TikTok", host: "tiktok.com", matters: "Reach for a consumer brand, and increasingly used as a search engine by younger buyers." },
];

/** Hosts that resolve to the same platform under a different domain. */
const HOST_ALIASES: Record<string, string> = {
  "twitter.com": "x",
  "fb.com": "facebook",
  "youtu.be": "youtube",
};

export type SocialPlatformCheck = {
  platform: string;
  label: string;
  /** The profile found, or an empty string when nothing was discoverable. */
  url: string;
  found: boolean;
  /** How it was established, quotable in the report. */
  method: "website link" | "rendered website link" | "prior research" | "web search" | "no profile discoverable";
  matters: string;
};

export type SocialSweep = {
  checks: SocialPlatformCheck[];
  found: Array<{ platform: string; url: string }>;
  /** Labels of the platforms nothing could be found on. */
  undiscoverable: string[];
  /** How many of the brand's own pages were read looking for published links. */
  pagesRead: number;
  /** True when the per-platform searches actually reached the web. */
  searchReached: boolean;
  /**
   * True when the site was opened in a real browser and scrolled, so links a
   * plain fetch cannot see were included. Absence means more when this is true.
   */
  rendered: boolean;
};

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

/** Which audited platform a URL belongs to, if any. */
function platformOf(url: string) {
  const host = hostOf(url);
  if (!host) return "";
  if (HOST_ALIASES[host]) return HOST_ALIASES[host];
  for (const alias of Object.keys(HOST_ALIASES)) {
    if (host.endsWith(`.${alias}`)) return HOST_ALIASES[alias];
  }
  const match = AUDITED_PLATFORMS.find((entry) => host === entry.host || host.endsWith(`.${entry.host}`));
  return match ? match.platform : "";
}

/**
 * A platform's front door, a share button, or a single embedded video is not a
 * company profile. Stripe's homepage links one YouTube video: counted naively
 * that reads as "Stripe runs a YouTube channel", which is not what the link
 * shows.
 */
function isProfileUrl(url: string, platform: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  const path = parsed.pathname.replace(/\/+$/, "");
  if (!path || path === "/") return false;
  if (/^\/(share|sharer|intent|home|login|signin|signup|register|privacy|terms|help|support|search|hashtag|explore|pages\/create|watch|shorts|playlist|embed|results)/i.test(path)) return false;
  if (parsed.searchParams.has("u") || parsed.searchParams.has("url") || parsed.searchParams.has("text") || parsed.searchParams.has("v")) return false;
  // A LinkedIn profile is a company, school, showcase or member page. Anything
  // else on the domain is a post, a job ad, or the product itself.
  if (platform === "linkedin" && !/^\/(company|school|showcase|in)\//i.test(path)) return false;
  if (platform === "youtube" && !/^\/(c|channel|user|@)/i.test(path)) return false;
  return true;
}

/** Every href in a blob of markup, resolved against the page it came from. */
function linksIn(html: string, base: string) {
  const found: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["']/gi)) {
    try { found.push(new URL(match[1], base).toString()); } catch { /* a malformed href is simply skipped */ }
  }
  return found;
}

/**
 * Opens the site in a real browser and reads the links a plain fetch cannot
 * see. Nike's homepage is the case that motivated this: 5937 characters of
 * readable text, 271 links, and not one social profile among them, because the
 * footer is built by script after load.
 *
 * Entirely optional. With no browser connected this returns nothing and the
 * sweep carries on with the static routes.
 */
async function renderedProfileLinks(targetUrl: string) {
  if (!browserConfigured()) return null;
  try {
    // Enough scrolling to reach a footer, and a hard ceiling so a slow or wedged
    // browser can never hold up the audit.
    const page = await Promise.race([
      renderPage(targetUrl, { scrolls: 4, settleMs: 1800 }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000)),
    ]);
    if (!page) return null;
    const profiles = new Map<string, string>();
    for (const link of linksIn(page.html, page.url || targetUrl)) {
      const platform = platformOf(link);
      if (platform && isProfileUrl(link, platform) && !profiles.has(platform)) profiles.set(platform, link);
    }
    return profiles;
  } catch {
    // A browser that will not start must never fail the audit.
    return null;
  }
}

/** A result only counts when the profile is plausibly this company's. */
function namesBrand(text: string, brandName: string) {
  const haystack = text.toLowerCase();
  const words = brandName.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  if (!words.length) return false;
  const significant = words.filter((word) => !["the", "inc", "ltd", "llc", "plc", "limited", "company", "group", "corp", "holdings"].includes(word));
  const testable = significant.length ? significant : words;
  return testable.some((word) => haystack.includes(word));
}

export async function sweepSocialPresence(input: {
  brandName: string;
  targetUrl: string;
  /** Profiles earlier prospect research already recorded. */
  known?: Array<{ platform: string; url: string }>;
  /** Outbound social links the website publishes about itself. */
  siteLinks?: Array<{ platform: string; url: string }>;
  /** How many of the brand's pages the crawl actually read. */
  pagesRead?: number;
}): Promise<SocialSweep> {
  const fromSite = new Map<string, string>();
  for (const entry of input.siteLinks || []) {
    const platform = platformOf(entry.url);
    if (platform && isProfileUrl(entry.url, platform) && !fromSite.has(platform)) fromSite.set(platform, entry.url);
  }
  const fromResearch = new Map<string, string>();
  for (const entry of input.known || []) {
    const platform = platformOf(entry.url) || entry.platform;
    if (platform && isProfileUrl(entry.url, platform) && !fromResearch.has(platform)) fromResearch.set(platform, entry.url);
  }

  const fromRendered = await renderedProfileLinks(input.targetUrl);

  const domain = hostOf(input.targetUrl);
  let searchReached = false;

  const checks = await Promise.all(AUDITED_PLATFORMS.map(async (entry): Promise<SocialPlatformCheck> => {
    const base = { platform: entry.platform, label: entry.label, matters: entry.matters };
    const linked = fromSite.get(entry.platform);
    if (linked) return { ...base, url: linked, found: true, method: "website link" };
    const rendered = fromRendered?.get(entry.platform);
    if (rendered) return { ...base, url: rendered, found: true, method: "rendered website link" };
    const researched = fromResearch.get(entry.platform);
    if (researched) return { ...base, url: researched, found: true, method: "prior research" };

    // Nothing points at this platform from the brand's own pages, so try the
    // open web before recording that it could not be found.
    try {
      const results = await searchOpenWeb(`${entry.host} ${input.brandName}${domain ? ` ${domain}` : ""}`, 8, { includeSocial: true });
      if (results.length) searchReached = true;
      const hit = results.find((result) => (
        platformOf(result.url) === entry.platform
        && isProfileUrl(result.url, entry.platform)
        && namesBrand(`${result.title} ${result.description} ${result.url}`, input.brandName)
      ));
      if (hit) return { ...base, url: hit.url, found: true, method: "web search" };
    } catch {
      // A failed search is not evidence either way; it falls through below.
    }
    return { ...base, url: "", found: false, method: "no profile discoverable" };
  }));

  return {
    checks,
    found: checks.filter((check) => check.found).map((check) => ({ platform: check.platform, url: check.url })),
    undiscoverable: checks.filter((check) => !check.found).map((check) => check.label),
    pagesRead: Math.max(1, input.pagesRead || 1),
    searchReached,
    rendered: fromRendered !== null,
  };
}

/**
 * The social score, derived from what the sweep found rather than left to a
 * guess. This scores how findable the brand is on each channel, which is the
 * thing the audit can actually stand behind.
 */
export function socialScoreFrom(sweep: SocialSweep) {
  const found = sweep.found.length;
  if (found === 0) return 20;
  if (found === 1) return 40;
  if (found === 2) return 55;
  if (found === 3) return 68;
  return 78;
}

/** A plain reading of the sweep, used as the observation when there is no AI. */
export function socialObservationFrom(sweep: SocialSweep, brandName: string) {
  const checked = sweep.checks.map((check) => check.label).join(", ");
  const how = `${sweep.pagesRead} page${sweep.pagesRead === 1 ? "" : "s"} of the website ${sweep.pagesRead === 1 ? "was" : "were"} read for published profile links${sweep.rendered ? ", the homepage was also opened in a real browser and scrolled so that links added by script were included" : ""}${sweep.searchReached ? ", and each platform was then searched for by name on the open web" : ""}`;
  if (!sweep.found.length) {
    return `No profile for ${brandName} could be found on any of the ${sweep.checks.length} platforms checked (${checked}). ${how}. None of those routes surfaced a single channel, so a customer who hears the name and looks for the brand anywhere other than the website finds nothing. ${sweep.rendered ? "The rendered page was checked too, so this is not simply a link the crawler could not see." : "Accounts may still exist while being unlinked and unindexed; either way the brand is currently unreachable off its own site."} Confirm which of the two it is before this reaches the client, because the fix differs: link and index what exists, or open and claim what does not.`;
  }
  const present = sweep.checks.filter((check) => check.found).map((check) => `${check.label} (found via ${check.method})`).join(", ");
  if (!sweep.undiscoverable.length) return `A profile was found on every platform checked: ${present}.`;
  return `Found on ${present}. No profile could be found for ${sweep.undiscoverable.join(", ")}: ${how}. None of those routes surfaced one. Either the channel does not exist or it is not linked from the website, and both are worth closing.`;
}
