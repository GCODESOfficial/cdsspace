/** Shared blog constants & helpers (server + client safe - no imports). */

export const BLOG_CATEGORIES = [
  "Branding",
  "Business Development",
  "AI",
  "Web3",
  "Product Design",
  "UI/UX",
  "Marketing",
  "Technology",
  "BSD Sessions",
  "Case Studies",
  "Company News",
  "Careers",
  "Training",
  "Research",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export const BLOG_STATUSES = [
  "draft",
  "scheduled",
  "published",
  "hidden",
  "archived",
  "deleted",
] as const;

export type BlogStatus = (typeof BLOG_STATUSES)[number];

export const SITE_URL = "https://cdsspace.pro";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** ~200 wpm reading estimate from rich HTML; always at least 1 minute. */
export function readingTimeMinutes(html: string): number {
  const text = (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  return Math.max(1, Math.round(words / 200));
}

export function postUrl(slug: string): string {
  return `${SITE_URL}/blog/${slug}`;
}

export interface BlogAuthor {
  id: string;
  name: string;
  photo_url: string | null;
  position: string | null;
  bio: string | null;
  social_links: Record<string, string>;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  cover_url: string | null;
  category: string;
  tags: string[];
  content: string;
  series: string | null;
  seo_title: string | null;
  seo_description: string | null;
  author_id: string | null;
  status: BlogStatus;
  published_at: string | null;
  reading_time: number;
  views: number;
  likes_count: number;
  dislikes_count: number;
  sharing_enabled: boolean;
  reactions_enabled: boolean;
  created_at: string;
  updated_at: string;
  // joined
  author_name?: string | null;
  author_photo?: string | null;
  author_position?: string | null;
  author_bio?: string | null;
}
