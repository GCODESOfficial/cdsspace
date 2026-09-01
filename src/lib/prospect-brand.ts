import "server-only";

import { createHash } from "node:crypto";

/**
 * Brand consistency between a company's website and its social accounts, and
 * whether both the bare domain and the www host actually serve the site.
 *
 * Images are compared by their bytes and by their shape, read straight from the
 * PNG, JPEG, GIF or WebP header rather than decoded. That is enough to say "this
 * is literally the same file", "this is a different file of the same shape", or
 * "this is a different shape entirely", which is what a designer needs to know
 * before looking. Nothing here claims to judge a design; it points at the pairs
 * worth opening.
 */

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface BrandAsset {
  source: string;
  url: string;
  hash: string;
  width: number | null;
  height: number | null;
  bytes: number;
}

export interface BrandFinding {
  area: string;
  status: "consistent" | "differs" | "missing" | "unchecked";
  detail: string;
  evidence: string[];
}

export interface DomainVariant {
  host: string;
  url: string;
  status: number | null;
  ok: boolean;
  redirectsTo: string | null;
  note: string;
}

function absolute(value: string, base: string) {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

/** Logo and brand imagery a page advertises about itself, best candidate first. */
export function brandImageCandidates(html: string, pageUrl: string) {
  const found: Array<{ source: string; url: string }> = [];
  const push = (source: string, value: string | undefined) => {
    const url = value ? absolute(value.trim(), pageUrl) : null;
    if (url && !found.some((entry) => entry.url === url)) found.push({ source, url });
  };

  push("og:image", html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]);
  push("og:image", html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1]);
  push("twitter:image", html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1]);
  push("apple-touch-icon", html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1]);
  push("icon", html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1]);

  // An <img> the page itself calls a logo is usually the real mark.
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/logo|brand|wordmark/i.test(tag)) continue;
    push("site logo", tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]);
    if (found.length > 6) break;
  }
  return found.slice(0, 6);
}

/** Reads pixel dimensions out of an image header without decoding the image. */
function imageSize(buffer: Buffer): { width: number | null; height: number | null } {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 10 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length > 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    if (buffer.toString("ascii", 12, 16) === "VP8X") return { width: (buffer.readUIntLE(24, 3) & 0xffffff) + 1, height: (buffer.readUIntLE(27, 3) & 0xffffff) + 1 };
    return { width: null, height: null };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      // Start-of-frame markers carry the dimensions.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return { width: null, height: null };
}

async function fetchAsset(source: string, url: string): Promise<BrandAsset | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    if (!/^image\//i.test(type)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 8_000_000) return null;
    const { width, height } = imageSize(buffer);
    return { source, url, hash: createHash("sha256").update(buffer).digest("hex").slice(0, 32), width, height, bytes: buffer.length };
  } catch {
    return null;
  }
}

/** Every brand image a page serves, so a like-for-like comparison is possible. */
export async function brandAssetsFor(html: string, pageUrl: string, limit = 4) {
  const assets: BrandAsset[] = [];
  for (const candidate of brandImageCandidates(html, pageUrl)) {
    const asset = await fetchAsset(candidate.source, candidate.url);
    if (asset && !assets.some((entry) => entry.hash === asset.hash)) assets.push(asset);
    if (assets.length >= limit) break;
  }
  return assets;
}

/** The first brand image a page actually serves. */
export async function brandAssetFor(html: string, pageUrl: string) {
  return (await brandAssetsFor(html, pageUrl, 1))[0] || null;
}

function ratio(asset: BrandAsset) {
  return asset.width && asset.height ? asset.width / asset.height : null;
}

/**
 * Compares each social account's brand image against the website's, and checks
 * that the account name still reads like the company. A logo that differs
 * between a website and a social profile is the exact inconsistency a rebrand
 * leaves behind, and it is a concrete thing to open a conversation with.
 */
export async function assessBrandConsistency(input: {
  companyName: string;
  siteHtml: string;
  siteUrl: string;
  socials: Array<{ platform: string; url: string }>;
}): Promise<BrandFinding[]> {
  const findings: BrandFinding[] = [];
  const siteAssets = input.siteHtml ? await brandAssetsFor(input.siteHtml, input.siteUrl) : [];
  const siteAsset = siteAssets[0] || null;

  if (!siteAsset) {
    findings.push({
      area: "Website brand image",
      status: "missing",
      detail: "The website publishes no logo or social preview image that could be read, so social previews and search results have no brand mark to show.",
      evidence: input.siteUrl ? [input.siteUrl] : [],
    });
  }

  for (const social of input.socials.slice(0, 6)) {
    let html = "";
    try {
      const response = await fetch(social.url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12_000) });
      html = response.ok ? (await response.text()).slice(0, 400_000) : "";
    } catch {
      html = "";
    }
    if (!html) {
      findings.push({
        area: `${social.platform} profile`,
        status: "unchecked",
        detail: `The ${social.platform} profile could not be read automatically, which is normal for that platform. Compare its picture with the website logo by eye.`,
        evidence: [social.url],
      });
      continue;
    }

    const profileAsset = await brandAssetFor(html, social.url);
    const handleMatches = new RegExp(input.companyName.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(html.slice(0, 40_000));

    if (!profileAsset) {
      findings.push({
        area: `${social.platform} profile`,
        status: "missing",
        detail: `No profile image could be read from the ${social.platform} account.`,
        evidence: [social.url],
      });
      continue;
    }
    if (!siteAsset) continue;

    // Compare against every brand image the site serves, not just the first.
    // A site's og:image is a wide preview card while a profile picture is square,
    // so comparing those two shapes proves nothing. The closest-shaped site asset
    // is the fair comparison, and an exact byte match anywhere means consistent.
    const sameFile = siteAssets.some((asset) => asset.hash === profileAsset.hash);
    const profileRatio = ratio(profileAsset);
    const comparable = profileRatio === null
      ? siteAsset
      : siteAssets.reduce((best, asset) => {
        const current = ratio(asset);
        const bestRatio = ratio(best);
        if (current === null) return best;
        if (bestRatio === null) return asset;
        return Math.abs(current - profileRatio) < Math.abs(bestRatio - profileRatio) ? asset : best;
      }, siteAsset);
    const comparableRatio = ratio(comparable);
    const shapeKnown = profileRatio !== null && comparableRatio !== null;
    const sameShape = shapeKnown && Math.abs(comparableRatio - profileRatio) < 0.15;

    findings.push({
      area: `${social.platform} logo`,
      status: sameFile ? "consistent" : "differs",
      detail: sameFile
        ? `The ${social.platform} profile uses the same brand image file the website publishes, so the mark is consistent across both.`
        : !shapeKnown || sameShape
          ? `The ${social.platform} profile picture is a different image file from the closest brand image on the website. It may be the same mark exported at another size, or an older logo left behind after a rebrand. Open both and compare.`
          : `The ${social.platform} profile picture (${profileAsset.width || "?"}x${profileAsset.height || "?"}) does not match any brand image on the website, and the nearest one is a different shape (${comparable.width || "?"}x${comparable.height || "?"}). Worth checking whether the social account is still carrying a previous version of the logo.`,
      evidence: [social.url, profileAsset.url, comparable.url],
    });

    if (!handleMatches) {
      findings.push({
        area: `${social.platform} naming`,
        status: "differs",
        detail: `The ${social.platform} page does not visibly carry the company name, so the account may be under an old brand name or may belong to someone else.`,
        evidence: [social.url],
      });
    }
  }

  if (!input.socials.length) {
    findings.push({
      area: "Social presence",
      status: "missing",
      detail: "No social accounts were found, so there is no brand presence to keep consistent with the website.",
      evidence: [],
    });
  }
  return findings;
}

/**
 * Checks the bare domain and the www host separately. Configuring one and
 * leaving the other is a common oversight that silently loses visitors who type
 * the address the other way.
 */
export async function checkDomainVariants(domain: string): Promise<DomainVariant[]> {
  const bare = domain.replace(/^www\./, "");
  const hosts = [bare, `www.${bare}`];
  const results: DomainVariant[] = [];

  for (const host of hosts) {
    const url = `https://${host}/`;
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(12_000),
      });
      const location = response.headers.get("location");
      await response.body?.cancel();
      const redirecting = response.status >= 300 && response.status < 400;
      results.push({
        host,
        url,
        status: response.status,
        ok: response.status < 400,
        redirectsTo: redirecting && location ? absolute(location, url) : null,
        note: redirecting && location
          ? `Redirects to ${absolute(location, url)}`
          : response.status < 400
            ? "Serves the site directly"
            : `Responded ${response.status}`,
      });
    } catch (error) {
      results.push({
        host,
        url,
        status: null,
        ok: false,
        redirectsTo: null,
        note: `Did not respond (${error instanceof Error ? error.message.slice(0, 80) : "connection failed"})`,
      });
    }
  }
  return results;
}

/** A plain-language finding about the www and bare domain configuration. */
export function domainVariantFinding(variants: DomainVariant[]) {
  const bare = variants.find((entry) => !entry.host.startsWith("www."));
  const www = variants.find((entry) => entry.host.startsWith("www."));
  if (!bare || !www) return null;
  if (bare.ok && www.ok) return null;
  if (bare.ok && !www.ok) {
    return `The website answers on ${bare.host} but not on ${www.host}, so anyone typing the www address reaches an error. This is a DNS or server configuration gap, not a design problem, and it is quick to fix.`;
  }
  if (!bare.ok && www.ok) {
    return `The website answers on ${www.host} but not on the bare ${bare.host}, so anyone typing the address without www reaches an error. Most people type it without www.`;
  }
  return `Neither ${bare.host} nor ${www.host} served a page when checked, so the website may be down.`;
}
