/**
 * Keeps the directory to legitimate trading businesses.
 *
 * CDS Space sells branding and digital work to real companies, so adult sites,
 * dating platforms and nightlife venues are never wanted, whether they arrive
 * from a company register, a directory page, or a web search for a company's
 * website. A search for "Xendit" really does return xvideos.com, so the block
 * has to sit on the way in rather than being cleaned up afterwards.
 *
 * The rules are deliberately specific. Broad words are not used: "adult" alone
 * would block adult education, "club" alone would block sports clubs, and both
 * are businesses worth having.
 */

/** Hosts that are never a company website, matched on the registrable domain. */
const EXCLUDED_DOMAINS = new Set([
  // Adult
  "xvideos.com", "xnxx.com", "pornhub.com", "xhamster.com", "redtube.com", "youporn.com",
  "spankbang.com", "eporner.com", "tube8.com", "beeg.com", "txxx.com", "hqporner.com",
  "brazzers.com", "bangbros.com", "naughtyamerica.com", "realitykings.com", "onlyfans.com",
  "fansly.com", "chaturbate.com", "stripchat.com", "bongacams.com", "livejasmin.com",
  "myfreecams.com", "cam4.com", "camsoda.com", "flirt4free.com", "adultfriendfinder.com",
  "fetlife.com", "nhentai.net", "rule34.xxx", "e-hentai.org", "hanime.tv", "motherless.com",
  "xhamsterlive.com", "porntrex.com", "thumbzilla.com", "youjizz.com", "pornone.com",
  // Dating and hookup
  "tinder.com", "badoo.com", "bumble.com", "okcupid.com", "match.com", "eharmony.com",
  "zoosk.com", "plentyoffish.com", "pof.com", "grindr.com", "hinge.co", "ashleymadison.com",
  "seeking.com", "seekingarrangement.com", "meetme.com", "skout.com", "victoriamilan.com",
  "sugardaddie.com", "adultmatchmaker.com", "fling.com", "benaughty.com", "jerkmate.com",
]);

/** Any domain under these top-level domains is adult by definition. */
const EXCLUDED_TLDS = [".xxx", ".porn", ".sex", ".adult", ".cam", ".tube"];

/**
 * Phrases that identify an excluded business in a company name, industry label,
 * or site description. Each one is specific enough to avoid a false positive on
 * a legitimate company.
 */
const EXCLUDED_PHRASES = [
  // Adult trade
  "pornograph", "porn site", "porn video", "adult video", "adult film", "adult entertainment",
  "adult industry", "adult content", "adult website", "adult webcam", "webcam model",
  "cam girl", "camgirl", "live cams", "sex shop", "sexshop", "sex toy", "sex toys",
  "sexual wellness toy", "erotic", "eroti", "fetish", "bdsm", "swinger", "brothel",
  "escort service", "escort agency", "escorts", "massage parlour", "massage parlor",
  "strip club", "stripclub", "strippers", "gentlemen's club", "gentlemens club",
  "lap dance", "peep show", "xxx",
  // Dating and hookup
  "dating app", "dating site", "dating website", "dating service", "dating agency",
  "dating platform", "online dating", "hookup", "hook-up app", "casual encounters",
  "sugar daddy", "sugar baby", "matchmaking service", "marriage bureau",
  // Nightlife venues
  "night club", "nightclub", "night-club", "hostess club", "shisha lounge", "hookah lounge",
];

const PHRASE_PATTERN = new RegExp(EXCLUDED_PHRASES.map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

/**
 * "Escort" is overwhelmingly adult in a company name, but vehicle, convoy and
 * close-protection escorts are real businesses. A legitimate qualifier alongside
 * it rescues the record rather than losing a security firm to a word match.
 */
const LEGITIMATE_ESCORT = /\b(security|vehicle|convoy|protection|patient|medical|ambulance|logistics|transport|haulage|abnormal load|police|armed|marine|pilot)\b/i;

/** Standalone words that are unambiguous on their own. */
const EXCLUDED_WORDS = /\b(porn|porno|pornos|xxx|nsfw|camsite|escort|escorts|brothel|stripper|strippers|onlyfans|hentai)\b/i;

function registrableDomain(value: string) {
  return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0];
}

/** True when a host should never be recorded as a company website or profile. */
export function isExcludedDomain(value: string | null | undefined) {
  const domain = registrableDomain(String(value || ""));
  if (!domain) return false;
  if (EXCLUDED_DOMAINS.has(domain)) return true;
  if (Array.from(EXCLUDED_DOMAINS).some((blocked) => domain.endsWith(`.${blocked}`))) return true;
  if (EXCLUDED_TLDS.some((tld) => domain.endsWith(tld))) return true;
  return EXCLUDED_WORDS.test(domain.replace(/[.-]/g, " "));
}

/**
 * True when a company should be kept out of the directory. Checks the name, the
 * industry label, the domain and any description together, because a register
 * often carries the giveaway in the industry rather than the name.
 */
export function isExcludedBusiness(input: {
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  description?: string | null;
}) {
  if (isExcludedDomain(input.domain) || isExcludedDomain(input.website)) return true;
  const text = [input.name, input.industry, input.description].filter(Boolean).join(" ").toLowerCase();
  if (!text) return false;
  // A qualifier such as "patient", "security" or "abnormal load" is what makes
  // an escort business legitimate, so the escort wording is set aside and the
  // rest of the name is judged on its own.
  if (/\bescorts?\b/i.test(text) && LEGITIMATE_ESCORT.test(text)) {
    const withoutEscort = text.replace(/\bescorts?\s+(service|services|agency|agencies)?/gi, " ");
    return PHRASE_PATTERN.test(withoutEscort) || EXCLUDED_WORDS.test(withoutEscort);
  }
  return PHRASE_PATTERN.test(text) || EXCLUDED_WORDS.test(text);
}

/** SQL fragment matching the same rules, for cleaning rows already stored. */
export const EXCLUDED_SQL_PATTERN = `(${EXCLUDED_PHRASES.map((phrase) => phrase.replace(/'/g, "''")).join("|")})`;
export const EXCLUDED_SQL_WORDS = `\\y(porn|porno|pornos|xxx|nsfw|camsite|escort|escorts|brothel|stripper|strippers|onlyfans|hentai)\\y`;
export const EXCLUDED_SQL_DOMAINS = Array.from(EXCLUDED_DOMAINS);
