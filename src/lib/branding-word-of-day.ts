export const BRANDING_WOTD_BLUE = "#0050DB";
export const BRANDING_WOTD_TIME_ZONE = "Africa/Lagos";

export interface BrandingWordLike {
  id: string;
  word: string;
  pronunciation: string | null;
  part_of_speech: string | null;
  meaning: string;
  example: string | null;
  feature_date?: string | null;
  editorial_rank?: number | null;
  created_at?: string | null;
}

export interface BrandingWordSelectionOptions {
  excludedWordIds?: Iterable<string>;
  excludedWords?: Iterable<string>;
}

export function getBrandingWordDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BRANDING_WOTD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function normalizeBrandingWordFeatureDate(value: string | null | undefined) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

export function normalizeBrandingWord(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function isSingleBrandingTerm(word: BrandingWordLike) {
  return (
    /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(String(word.word || "").trim())
    && Boolean(String(word.pronunciation || "").trim())
    && Boolean(String(word.meaning || "").trim())
  );
}

export function brandingWordDayNumber(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return Math.floor(Date.now() / 86_400_000);
  }
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function sortBrandingWords<T extends BrandingWordLike>(words: T[]) {
  return [...words].sort((a, b) => {
    const aRank = Number(a.editorial_rank || Number.MAX_SAFE_INTEGER);
    const bRank = Number(b.editorial_rank || Number.MAX_SAFE_INTEGER);
    if (aRank !== bRank) return aRank - bRank;
    const aDate = a.created_at || "";
    const bDate = b.created_at || "";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    const byWord = a.word.localeCompare(b.word);
    if (byWord !== 0) return byWord;
    return a.id.localeCompare(b.id);
  });
}

export function pickBrandingWordForDate<T extends BrandingWordLike>(
  words: T[],
  dateKey = getBrandingWordDateKey(),
  options: BrandingWordSelectionOptions = {},
) {
  const excludedIds = new Set(Array.from(options.excludedWordIds || [], String));
  const excludedWords = new Set(Array.from(options.excludedWords || [], normalizeBrandingWord));
  const list = sortBrandingWords(words).filter((word) => (
    isSingleBrandingTerm(word)
    && !excludedIds.has(String(word.id))
    && !excludedWords.has(normalizeBrandingWord(word.word))
  ));
  if (list.length === 0) return null;

  const featured = list.find((word) => normalizeBrandingWordFeatureDate(word.feature_date) === dateKey);
  if (featured) return featured;

  // Editorial rank is the queue. Once a term has been used it is excluded, so
  // the next valid single branding term advances without repetition.
  return list[0];
}
