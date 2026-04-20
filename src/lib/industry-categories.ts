export const INDUSTRY_CATEGORIES = [
  "Technology",
  "Blockchain",
  "Healthcare",
  "Retail",
  "Education",
  "Real Estate",
  "Fashion",
  "Beauty",
  "Other",
] as const;

export type IndustryCategory = typeof INDUSTRY_CATEGORIES[number];
