/**
 * Shared vocabulary for the worldwide prospect directory: how big the target is,
 * how a company name is reduced to an identity key, and the size bands used for
 * filtering. Kept free of server-only imports so the admin page can use it too.
 */

/** The directory target. Override with PROSPECT_DIRECTORY_TARGET if it moves. */
export const DIRECTORY_TARGET = Number(process.env.NEXT_PUBLIC_PROSPECT_DIRECTORY_TARGET || 10_000_000);

export const SIZE_BANDS = [
  { value: "solo", label: "Solo (1)", min: 1, max: 1 },
  { value: "micro", label: "Micro (2 to 10)", min: 2, max: 10 },
  { value: "small", label: "Small (11 to 50)", min: 11, max: 50 },
  { value: "medium", label: "Medium (51 to 250)", min: 51, max: 250 },
  { value: "large", label: "Large (251 to 1,000)", min: 251, max: 1000 },
  { value: "enterprise", label: "Enterprise (1,000+)", min: 1001, max: Number.MAX_SAFE_INTEGER },
] as const;

export type SizeBand = (typeof SIZE_BANDS)[number]["value"];

export function sizeBandFor(employees: number | null | undefined): SizeBand | null {
  if (!employees || employees < 1) return null;
  return (SIZE_BANDS.find((band) => employees >= band.min && employees <= band.max)?.value as SizeBand) || null;
}

/**
 * Legal-form suffixes stripped before comparing two company names. This list
 * mirrors the prospect_name_key() SQL function; keep the two in step so a name
 * matched in the application also matches the database unique index.
 */
/**
 * Legal-form suffixes stripped before comparing two company names. This list
 * mirrors the prospect_name_key() SQL function; keep the two in step so a name
 * matched in the application also matches the database unique index.
 *
 * Only genuine legal forms belong here. Descriptive words such as Holdings,
 * Group, Global or International are load bearing: dropping them merges
 * "Graham Holdings Co" into "Graham Corp", and "Spire Global" into "Spire",
 * which are different companies.
 */
const LEGAL_SUFFIXES = [
  "incorporated", "corporation", "company", "limited", "inc", "corp", "co", "ltd", "llc", "llp",
  "lp", "plc", "pte", "pty", "gmbh", "ag", "nv", "bv", "sa", "sas", "srl", "spa", "ab", "as", "oy",
  "ou", "aps", "kk", "kft", "sdn", "bhd", "jsc", "ooo", "pjsc", "fzco", "fze", "fzc", "dmcc", "wll",
  "sarl", "kg", "oyj", "asa", "doo", "dd", "zoo", "eood", "ood", "ik", "ky",
];

const SUFFIX_PATTERN = new RegExp(`\\b(${LEGAL_SUFFIXES.join("|")})\\b`, "g");

/**
 * Reduces a company name to a comparison key. "Acme Foods Ltd.", "ACME Foods
 * Limited" and "Acme Foods, Inc" all become "acme foods", so the same business
 * arriving from three different country lists is recognised as one company.
 */
export function companyNameKey(value: string): string {
  return (value || "")
    // A trailing branch or location qualifier is not a different company.
    // "GTBank (Enugu - Ogui Road)" and "GTBank (Kaduna)" are one bank.
    .replace(/\s*[([][^)\]]*[)\]]\s*$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(SUFFIX_PATTERN, " ")
    // Unicode letters and digits, not A to Z, so a Chinese, Arabic, Greek or
    // Cyrillic company name still produces a key instead of an empty string.
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Common country spellings folded to one label so presence rows do not split. */
const COUNTRY_ALIASES: Record<string, string> = {
  "usa": "United States", "us": "United States", "u.s.": "United States", "u.s.a.": "United States",
  "united states of america": "United States", "america": "United States",
  "uk": "United Kingdom", "u.k.": "United Kingdom", "great britain": "United Kingdom", "britain": "United Kingdom",
  "uae": "United Arab Emirates", "u.a.e.": "United Arab Emirates", "emirates": "United Arab Emirates",
  "drc": "Democratic Republic of the Congo", "ivory coast": "Cote d'Ivoire",
  "south korea": "Korea, Republic of", "north korea": "Korea, Democratic People's Republic of",
  "russia": "Russian Federation", "vietnam": "Viet Nam", "holland": "Netherlands",
  "ng": "Nigeria", "za": "South Africa", "ke": "Kenya", "gh": "Ghana", "eg": "Egypt",
};

export function normalizeCountry(value: string | null | undefined): string | null {
  const input = (value || "").trim().replace(/\s+/g, " ");
  if (!input || input.length > 60) return null;
  const alias = COUNTRY_ALIASES[input.toLowerCase()];
  if (alias) return alias;
  return input.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** A company is treated as a startup when it is young and not yet large. */
export function looksLikeStartup(input: { founded_year: number | null; employee_count: number | null; is_public: boolean | null }) {
  if (input.is_public) return false;
  if (!input.founded_year) return null;
  const age = new Date().getFullYear() - input.founded_year;
  if (age > 10) return false;
  return (input.employee_count || 0) <= 250;
}

export const STOCK_EXCHANGES = [
  { code: "NYSE", label: "New York Stock Exchange" },
  { code: "NASDAQ", label: "Nasdaq" },
  { code: "LSE", label: "London Stock Exchange" },
  { code: "TSX", label: "Toronto Stock Exchange" },
  { code: "ASX", label: "Australian Securities Exchange" },
  { code: "NGX", label: "Nigerian Exchange Group" },
  { code: "JSE", label: "Johannesburg Stock Exchange" },
  { code: "DFM", label: "Dubai Financial Market" },
  { code: "ADX", label: "Abu Dhabi Securities Exchange" },
  { code: "TADAWUL", label: "Saudi Exchange" },
  { code: "HKEX", label: "Hong Kong Exchanges" },
  { code: "SGX", label: "Singapore Exchange" },
  { code: "NSE", label: "National Stock Exchange of India" },
  { code: "BSE", label: "BSE India" },
  { code: "EURONEXT", label: "Euronext" },
  { code: "XETRA", label: "Deutsche Boerse Xetra" },
  { code: "SIX", label: "SIX Swiss Exchange" },
  { code: "TSE", label: "Tokyo Stock Exchange" },
  { code: "SSE", label: "Shanghai Stock Exchange" },
  { code: "B3", label: "B3 Brazil" },
] as const;

const EXCHANGE_PATTERN = new RegExp(
  `\\b(${STOCK_EXCHANGES.map((exchange) => exchange.code).join("|")})\\s*[:\\-]\\s*([A-Z]{1,6}(?:\\.[A-Z]{1,3})?)\\b`,
  "g",
);

/**
 * Reads listing signals such as "NYSE: MMM" or "LSE:VOD" out of page text. A
 * ticker in this form is published by the company itself, which makes it far
 * more reliable than asking a model whether a company is listed.
 */
export function detectListing(text: string): { is_public: boolean; exchanges: string[]; ticker: string | null } {
  const exchanges = new Set<string>();
  let ticker: string | null = null;
  for (const match of (text || "").matchAll(EXCHANGE_PATTERN)) {
    exchanges.add(match[1].toUpperCase());
    ticker = ticker || match[2].toUpperCase();
  }
  const investorSignal = /\b(investor relations|shareholder information|annual report|sec filings|form 10-k)\b/i.test(text || "");
  return {
    is_public: exchanges.size > 0 || investorSignal,
    exchanges: Array.from(exchanges),
    ticker,
  };
}
