export type CDocTheme = "dark" | "light";

export const DEFAULT_CDOC_THEME: CDocTheme = "dark";

export function normalizeCDocTheme(value?: string | null): CDocTheme {
  return value === "light" ? "light" : DEFAULT_CDOC_THEME;
}
