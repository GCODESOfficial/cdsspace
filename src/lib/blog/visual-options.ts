export const BLOG_VISUAL_TYPES = [
  { value: "image", label: "Image only", description: "Editorial or photographic visual without text." },
  { value: "illustration", label: "Illustration", description: "Conceptual artwork, diagrammatic scene, or abstract visual." },
  { value: "image_text", label: "Image + a few words", description: "A visual with one short headline or key phrase." },
  { value: "infographic", label: "Infographic", description: "A structured visual with a small amount of explanatory text." },
  { value: "chart", label: "Charts & graphs", description: "An exact data-driven chart using the values you provide." },
] as const;

export type BlogVisualType = (typeof BLOG_VISUAL_TYPES)[number]["value"];

export const BLOG_CHART_TYPES = [
  { value: "bar", label: "Bar chart" },
  { value: "line", label: "Line chart" },
  { value: "area", label: "Area chart" },
  { value: "pie", label: "Pie chart" },
  { value: "donut", label: "Donut chart" },
] as const;

export type BlogChartType = (typeof BLOG_CHART_TYPES)[number]["value"];

export const BLOG_VISUAL_PALETTES = [
  {
    value: "cds_core",
    label: "CDS Core",
    description: "Primary brand palette",
    colors: ["#040B37", "#1C4ED1", "#F4F6FB", "#FFFFFF"],
  },
  {
    value: "cds_electric",
    label: "CDS Electric",
    description: "High-energy brand gradient",
    colors: ["#0035C1", "#0575FF", "#0A4FE8", "#FFFFFF"],
  },
  {
    value: "cds_minimal",
    label: "CDS Minimal",
    description: "Neutral editorial palette",
    colors: ["#040B37", "#4B5563", "#E3E8F4", "#FFFFFF"],
  },
  {
    value: "cds_wotd",
    label: "CDS WOTD",
    description: "Signature WOTD blue",
    colors: ["#0050DB", "#040B37", "#F4F6FB", "#FFFFFF"],
  },
] as const;

export type BlogVisualPalette = (typeof BLOG_VISUAL_PALETTES)[number]["value"] | "custom";

export function isBlogVisualType(value: unknown): value is BlogVisualType {
  return BLOG_VISUAL_TYPES.some((item) => item.value === value);
}

export function isBlogChartType(value: unknown): value is BlogChartType {
  return BLOG_CHART_TYPES.some((item) => item.value === value);
}

export function resolveBlogVisualColors(palette: unknown, customColors: unknown): string[] {
  if (palette === "custom" && Array.isArray(customColors)) {
    const colors = customColors
      .map((color) => String(color || "").trim().toUpperCase())
      .filter((color) => /^#[0-9A-F]{6}$/.test(color))
      .slice(0, 6);
    if (colors.length >= 2) return colors;
  }

  return [...(BLOG_VISUAL_PALETTES.find((item) => item.value === palette)?.colors
    || BLOG_VISUAL_PALETTES[0].colors)];
}
