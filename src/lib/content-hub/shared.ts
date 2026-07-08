/**
 * Content Hub - shared types + option catalogues.
 *
 * Client-safe (no server-only imports) so both the wizard UI and the API
 * routes can share the same vocabulary for platforms, content types,
 * statuses, tones, CTA presets, clip types and reminder offsets.
 */

export type ContentSource = "manual" | "ai" | "image" | "video" | "bsd";
export type ContentStatus =
  | "draft"
  | "pending"
  | "approved"
  | "scheduled"
  | "published"
  | "archived"
  | "deleted";
export type MediaKind = "image" | "video" | "pdf" | "document" | "clip";

export interface ContentMedia {
  id: string;
  content_id: string;
  url: string;
  kind: MediaKind;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  thumbnail_url: string | null;
  position: number;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface ContentItem {
  id: string;
  title: string;
  body: string;
  source: ContentSource;
  category: string | null;
  content_type: string | null;
  platforms: string[];
  cta_label: string | null;
  cta_url: string | null;
  cta_type: string | null;
  hashtags: string[];
  status: ContentStatus;
  scheduled_at: string | null;
  scheduled_platform: string | null;
  assigned_publisher_id: string | null;
  assigned_publisher_name: string | null;
  campaign: string | null;
  series: string | null;
  tags: string[];
  ai_meta: Record<string, unknown>;
  posted_url: string | null;
  performance_notes: string | null;
  reach: number | null;
  engagement: number | null;
  leads: number | null;
  published_at: string | null;
  created_by: string | null;
  created_by_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  media?: ContentMedia[];
}

// ─────────────── Option catalogues ───────────────

export const PLATFORMS: { value: string; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X (Twitter)" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "website", label: "Website" },
];

export const CONTENT_TYPES: string[] = [
  "Marketing",
  "BSD",
  "Internship",
  "Hiring",
  "Case Study",
  "Brand Audit",
  "Event",
  "Announcement",
];

export const CATEGORIES: string[] = [
  "Brand Identity",
  "Web Design",
  "Print",
  "Strategy",
  "Culture",
  "Education",
  "Testimonial",
  "Promotion",
];

export const TONES: { value: string; label: string }[] = [
  { value: "professional", label: "Professional Tone" },
  { value: "founder", label: "Founder Tone" },
  { value: "tcj", label: "TCJ Tone" },
  { value: "cdsspace", label: "CDS Space Tone" },
];

// AI enhancement actions available in Step 3.
export const ENHANCE_ACTIONS: { value: string; label: string }[] = [
  { value: "improve", label: "Improve Content" },
  { value: "rewrite", label: "Rewrite" },
  { value: "expand", label: "Expand" },
  { value: "shorten", label: "Shorten" },
  { value: "storytelling", label: "Add Storytelling" },
  { value: "hook", label: "Add Hook" },
];

export const CTA_PRESETS: { value: string; label: string; cta_label: string; cta_type: string }[] = [
  { value: "lead_gen", label: "Lead Generation", cta_label: "Book a Consultation", cta_type: "lead_gen" },
  { value: "bsd", label: "BSD", cta_label: "Join BSD This Wednesday", cta_type: "bsd" },
  { value: "hiring", label: "Hiring", cta_label: "Apply Now", cta_type: "hiring" },
  { value: "internship", label: "Internship", cta_label: "Start Your Journey", cta_type: "internship" },
  { value: "custom", label: "Custom", cta_label: "", cta_type: "custom" },
];

export const CLIP_COUNTS = [5, 10, 20];

export const CLIP_TYPES: { value: string; label: string }[] = [
  { value: "highlight", label: "Highlight" },
  { value: "quote", label: "Quote" },
  { value: "key_lesson", label: "Key Lesson" },
  { value: "cta", label: "Call To Action" },
  { value: "founder_insight", label: "Founder Insight" },
  { value: "bsd_insight", label: "BSD Insight" },
];

// Reminder lead times. `due` fires at posting time.
export const REMINDER_OFFSETS: { value: string; label: string; minutesBefore: number }[] = [
  { value: "24h", label: "24 hours before", minutesBefore: 24 * 60 },
  { value: "1h", label: "1 hour before", minutesBefore: 60 },
  { value: "15m", label: "15 minutes before", minutesBefore: 15 },
  { value: "due", label: "At posting time", minutesBefore: 0 },
];

export const REMINDER_CHANNELS: { value: string; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "push", label: "Mobile Push" },
];

export const STATUS_META: Record<ContentStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" },
  pending: { label: "Pending Approval", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  approved: { label: "Approved", className: "bg-blue-50 text-[#0A4FE8] ring-1 ring-blue-200" },
  scheduled: { label: "Scheduled", className: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  published: { label: "Published", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  archived: { label: "Archived", className: "bg-slate-100 text-slate-500 ring-1 ring-slate-200" },
  deleted: { label: "Deleted", className: "bg-red-50 text-red-600 ring-1 ring-red-200" },
};

export function platformLabel(value: string): string {
  return PLATFORMS.find((p) => p.value === value)?.label || value;
}

export function mediaKindFromMime(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return "document";
}
