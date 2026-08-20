/** Shared Intelligence publishing constants and helpers (server/client safe). */

export const BLOG_CATEGORIES = [
  "Brand Research",
  "Brand Audits",
  "Industry Benchmarks",
  "Market Intelligence",
  "Customer Experience",
  "Digital Readiness",
  "Executive Insights",
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
  "in_review",
  "approved",
  "scheduled",
  "published",
  "hidden",
  "private",
  "archived",
  "deleted",
] as const;

export type BlogStatus = (typeof BLOG_STATUSES)[number];

export const INTELLIGENCE_PUBLICATION_TYPES = [
  "Brand Intelligence Report",
  "Public Brand Audit",
  "Industry Benchmark",
  "Industry Brand Scorecard",
  "Market Entry Brief",
  "Customer Experience Review",
  "Digital Readiness Assessment",
  "Executive Insight",
  "Case Study",
  "Research Note",
  "Executive Research Brief",
  "Private Brand Infrastructure Assessment",
] as const;

export type IntelligencePublicationType = (typeof INTELLIGENCE_PUBLICATION_TYPES)[number];

export const INTELLIGENCE_ACCESS_LEVELS = ["public", "account", "private_client", "hidden"] as const;
export type IntelligenceAccessLevel = (typeof INTELLIGENCE_ACCESS_LEVELS)[number];

export const INTELLIGENCE_PDF_ACCESS = ["view", "download", "download_print"] as const;
export type IntelligencePdfAccess = (typeof INTELLIGENCE_PDF_ACCESS)[number];

export const INTELLIGENCE_CTA_TYPES = [
  "none",
  "book_consultation",
  "request_assessment",
  "download_summary",
  "start_project",
  "contact_team",
  "custom",
] as const;

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
  return `${SITE_URL}/intelligence/${slug}`;
}

export interface BlogAuthor {
  id: string;
  name: string;
  photo_url: string | null;
  position: string | null;
  bio: string | null;
  social_links: Record<string, string>;
  role?: string | null;
  expertise?: string[];
  contributor_type?: string;
  is_external?: boolean;
  organization?: string | null;
  profile_url?: string | null;
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
  loves_count: number;
  comments_count: number;
  shares_count: number;
  downloads_count: number;
  cta_clicks: number;
  unique_views: number;
  sharing_enabled: boolean;
  reactions_enabled: boolean;
  comments_enabled: boolean;
  replies_enabled: boolean;
  downloads_enabled: boolean;
  printing_enabled: boolean;
  view_count_enabled: boolean;
  publication_type: IntelligencePublicationType | string;
  executive_summary: string | null;
  country: string | null;
  city: string | null;
  industry: string | null;
  company_analysed: string | null;
  social_image_url: string | null;
  social_title: string | null;
  social_description: string | null;
  canonical_url: string | null;
  original_source_url: string | null;
  focus_keywords: string[];
  cta_type: string;
  cta_text: string | null;
  cta_url: string | null;
  cta_supporting_line: string | null;
  pdf_storage_path: string | null;
  pdf_display_name: string | null;
  pdf_page_count: number | null;
  pdf_preview_url: string | null;
  pdf_access_mode: IntelligencePdfAccess;
  executive_summary_storage_path: string | null;
  video_url: string | null;
  supporting_media: Array<Record<string, unknown>>;
  featured: boolean;
  access_level: IntelligenceAccessLevel;
  assigned_client_id: string | null;
  access_expires_at: string | null;
  private_token: string | null;
  internal_notes: string | null;
  report_status: string;
  ai_assisted: boolean;
  approval_status: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  author_name?: string | null;
  author_photo?: string | null;
  author_position?: string | null;
  author_bio?: string | null;
  author_is_external?: boolean;
  author_profile_url?: string | null;
  author_organization?: string | null;
}
