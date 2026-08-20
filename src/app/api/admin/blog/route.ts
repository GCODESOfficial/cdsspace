import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery, glashOne, glashMaybeOne } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import {
  slugify,
  readingTimeMinutes,
  BLOG_STATUSES,
  INTELLIGENCE_ACCESS_LEVELS,
  INTELLIGENCE_PDF_ACCESS,
  INTELLIGENCE_PUBLICATION_TYPES,
  INTELLIGENCE_CTA_TYPES,
  type BlogStatus,
} from "@/lib/blog/constants";
import {
  assertTrustedMutationOrigin,
  cleanText,
  safePublicUrl,
  sanitizeIntelligenceHtml,
} from "@/lib/intelligence/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canManage(s: AdminSession) {
  return s.role === "super_admin" || hasPermission(s.permissions, "blog");
}

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) return { session: null, denied: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!canManage(session)) return { session, denied: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  return { session, denied: null as NextResponse | null };
}

function requireOrigin(req: NextRequest) {
  return assertTrustedMutationOrigin(req)
    ? null
    : NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "publication";
  let candidate = root;
  for (let i = 2; i < 50; i++) {
    const row = await glashMaybeOne<{ id: string }>(`select id from public.blog_posts where slug = $1 limit 1`, [candidate]);
    if (!row || row.id === excludeId) return candidate;
    candidate = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}

function normaliseStatus(value: unknown): BlogStatus {
  return BLOG_STATUSES.includes(value as BlogStatus) ? (value as BlogStatus) : "draft";
}

function stringArray(value: unknown, maxItems = 20): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, maxItems)
    : [];
}

function nullableText(value: unknown, max = 5000) {
  const cleaned = cleanText(value, max);
  return cleaned || null;
}

const ARRAY_FIELDS = new Set(["tags", "focus_keywords"]);
const JSON_FIELDS = new Set(["supporting_media"]);
const BOOLEAN_FIELDS = new Set([
  "sharing_enabled", "reactions_enabled", "comments_enabled", "replies_enabled",
  "downloads_enabled", "printing_enabled", "view_count_enabled", "featured", "ai_assisted",
]);

const MUTABLE_FIELDS = [
  "title", "subtitle", "excerpt", "cover_url", "category", "tags", "content", "series",
  "seo_title", "seo_description", "author_id", "publication_type", "executive_summary",
  "country", "city", "industry", "company_analysed", "social_image_url", "social_title",
  "social_description", "canonical_url", "original_source_url", "focus_keywords", "cta_type", "cta_text", "cta_url",
  "cta_supporting_line", "pdf_storage_path", "pdf_display_name", "pdf_page_count", "pdf_access_mode",
  "executive_summary_storage_path", "video_url", "supporting_media", "comments_enabled",
  "replies_enabled", "downloads_enabled", "printing_enabled", "view_count_enabled", "featured",
  "access_level", "assigned_client_id", "access_expires_at", "internal_notes", "report_status",
  "ai_assisted", "approval_status", "sharing_enabled", "reactions_enabled",
] as const;

function normaliseField(key: string, value: unknown): unknown {
  if (key === "content") return sanitizeIntelligenceHtml(value);
  if (ARRAY_FIELDS.has(key)) return stringArray(value);
  if (JSON_FIELDS.has(key)) return Array.isArray(value) ? value.slice(0, 40) : [];
  if (BOOLEAN_FIELDS.has(key)) return Boolean(value);
  if (key === "pdf_page_count") return Number.isFinite(Number(value)) ? Math.max(1, Math.round(Number(value))) : null;
  if (key === "cover_url" || key === "social_image_url" || key === "video_url") return safePublicUrl(value);
  if (key === "cta_url" || key === "canonical_url" || key === "original_source_url") return safePublicUrl(value, { allowMailto: key === "cta_url" });
  if (key === "publication_type") return INTELLIGENCE_PUBLICATION_TYPES.includes(value as never) ? value : "Executive Insight";
  if (key === "access_level") return INTELLIGENCE_ACCESS_LEVELS.includes(value as never) ? value : "public";
  if (key === "pdf_access_mode") return INTELLIGENCE_PDF_ACCESS.includes(value as never) ? value : "view";
  if (key === "cta_type") return INTELLIGENCE_CTA_TYPES.includes(value as never) ? value : "none";
  if (["author_id", "assigned_client_id", "access_expires_at", "executive_summary_storage_path", "pdf_storage_path"].includes(key)) {
    return String(value || "").trim() || null;
  }
  if (key === "title") return cleanText(value, 220);
  if (["excerpt", "seo_description", "social_description", "cta_supporting_line"].includes(key)) return nullableText(value, 500);
  if (["executive_summary", "internal_notes"].includes(key)) return nullableText(value, 12000);
  return nullableText(value, 300);
}

function sqlValue(field: string, position: number) {
  if (ARRAY_FIELDS.has(field)) return `$${position}::text[]`;
  if (JSON_FIELDS.has(field)) return `$${position}::jsonb`;
  return `$${position}`;
}

async function saveVersion(postId: string, snapshot: Record<string, unknown>, actor: string, summary: string) {
  await glashQuery(
    `insert into public.intelligence_versions
      (post_id, version_number, snapshot, change_summary, created_by, ai_assisted)
     values ($1,
       coalesce((select max(version_number) + 1 from public.intelligence_versions where post_id = $1), 1),
       $2::jsonb, $3, $4, $5)`,
    [postId, JSON.stringify(snapshot), summary, actor, Boolean(snapshot.ai_assisted)],
  );
}

async function externalSourceError(authorId: unknown, sourceUrl: unknown, status: BlogStatus) {
  if (!["published", "scheduled"].includes(status) || !authorId) return null;
  try {
    const author = await glashMaybeOne<{ is_external: boolean }>(
      `select is_external from public.blog_authors where id = $1 limit 1`,
      [authorId],
    );
    if (author?.is_external && !safePublicUrl(sourceUrl)) {
      return "An original post URL is required when publishing or scheduling a report originator.";
    }
  } catch (error) {
    if (!/column .*is_external.*does not exist/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }
  return null;
}

function publicationCoverError(status: BlogStatus, coverUrl: unknown) {
  if (!["published", "scheduled"].includes(status)) return null;
  return safePublicUrl(coverUrl)
    ? null
    : "A saved cover image is required before publishing or scheduling this publication.";
}

export async function GET(req: NextRequest) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const posts = await glashQuery(
    `select bp.*, ba.name as author_name
     from public.blog_posts bp
     left join public.blog_authors ba on ba.id = bp.author_id
     where ($1::boolean = true or (bp.status <> 'deleted' and bp.deleted_at is null))
     order by bp.updated_at desc`,
    [includeDeleted],
  );
  return NextResponse.json({ ok: true, posts });
}

export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin();
  if (denied) return denied;
  const originError = requireOrigin(req);
  if (originError) return originError;
  const body = await req.json().catch(() => ({}));
  const title = cleanText(body.title, 220);
  if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });

  const status = normaliseStatus(body.status);
  const fields: Record<string, unknown> = {
    slug: await uniqueSlug(body.slug || title),
    title,
    status,
    published_at: status === "published" ? (body.published_at || new Date().toISOString()) : (body.published_at || null),
    created_by: session!.email,
  };
  for (const field of MUTABLE_FIELDS) if (field in body) fields[field] = normaliseField(field, body[field]);
  if (!("publication_type" in fields)) fields.publication_type = "Executive Insight";
  if (!("content" in fields)) fields.content = "";
  if (!("category" in fields)) fields.category = "Executive Insights";
  if (!("tags" in fields)) fields.tags = [];
  fields.reading_time = readingTimeMinutes(String(fields.content || ""));

  const sourceError = await externalSourceError(fields.author_id, fields.original_source_url, status);
  if (sourceError) return NextResponse.json({ ok: false, error: sourceError }, { status: 400 });
  const coverError = publicationCoverError(status, fields.cover_url);
  if (coverError) return NextResponse.json({ ok: false, error: coverError }, { status: 400 });

  const keys = Object.keys(fields);
  const values = keys.map((key) => JSON_FIELDS.has(key) ? JSON.stringify(fields[key]) : fields[key]);
  const columns = keys.join(", ");
  const placeholders = keys.map((key, index) => sqlValue(key, index + 1)).join(", ");
  const post = await glashOne<Record<string, unknown>>(
    `insert into public.blog_posts (${columns}) values (${placeholders}) returning *`,
    values,
  );
  await saveVersion(String(post.id), post, session!.email, "Initial publication created");
  await logActivity({
    action: "intelligence.create", page: "intelligence", resource_type: "intelligence_publication",
    resource_id: String(post.id), resource_label: title, metadata: { status, publication_type: fields.publication_type },
  });
  return NextResponse.json({ ok: true, post });
}

export async function PATCH(req: NextRequest) {
  const { session, denied } = await requireAdmin();
  if (denied) return denied;
  const originError = requireOrigin(req);
  if (originError) return originError;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const current = await glashMaybeOne<Record<string, unknown>>(`select * from public.blog_posts where id = $1`, [id]);
  if (!current) return NextResponse.json({ ok: false, error: "Publication not found" }, { status: 404 });

  const fields: Record<string, unknown> = {};
  for (const field of MUTABLE_FIELDS) if (field in body) fields[field] = normaliseField(field, body[field]);
  if ("content" in body) fields.reading_time = readingTimeMinutes(String(fields.content || ""));
  if (body.slug) fields.slug = await uniqueSlug(body.slug, id);
  const requestedStatus = "status" in body ? normaliseStatus(body.status) : null;
  if (requestedStatus) {
    fields.status = requestedStatus;
    if (requestedStatus === "published" && !current.published_at && !body.published_at) fields.published_at = new Date().toISOString();
    // Restoring or republishing a soft-deleted publication must also clear the
    // deletion tombstone. Public queries intentionally exclude tombstoned rows.
    if (requestedStatus !== "deleted" && current.deleted_at) {
      fields.deleted_at = null;
      fields.deleted_by = null;
    } else if (requestedStatus === "deleted") {
      fields.deleted_at = current.deleted_at || new Date().toISOString();
      fields.deleted_by = session!.email;
    }
  }
  // The editor always sends this field. Do not let its empty value overwrite
  // the automatic first-publish timestamp set above.
  if ("published_at" in body && (body.published_at || requestedStatus !== "published")) {
    fields.published_at = body.published_at || null;
  }
  if (!Object.keys(fields).length) return NextResponse.json({ ok: true, post: current });

  const nextStatus = (fields.status || current.status || "draft") as BlogStatus;
  const sourceError = await externalSourceError(fields.author_id ?? current.author_id, fields.original_source_url ?? current.original_source_url, nextStatus);
  if (sourceError) return NextResponse.json({ ok: false, error: sourceError }, { status: 400 });
  const nextCover = Object.prototype.hasOwnProperty.call(fields, "cover_url") ? fields.cover_url : current.cover_url;
  const coverError = publicationCoverError(nextStatus, nextCover);
  if (coverError) return NextResponse.json({ ok: false, error: coverError }, { status: 400 });

  await saveVersion(id, current, session!.email, cleanText(body.change_summary, 300) || "Publication updated");
  const keys = Object.keys(fields);
  const values = keys.map((key) => JSON_FIELDS.has(key) ? JSON.stringify(fields[key]) : fields[key]);
  const set = keys.map((key, index) => `${key} = ${sqlValue(key, index + 2)}`).join(", ");
  const post = await glashOne<Record<string, unknown>>(
    `update public.blog_posts set ${set}, updated_at = now() where id = $1 returning *`,
    [id, ...values],
  );
  await logActivity({
    action: "intelligence.update", page: "intelligence", resource_type: "intelligence_publication",
    resource_id: id, resource_label: String(post.title || current.slug), metadata: { fields: keys },
  });
  return NextResponse.json({ ok: true, post });
}

export async function DELETE(req: NextRequest) {
  const { session, denied } = await requireAdmin();
  if (denied) return denied;
  const originError = requireOrigin(req);
  if (originError) return originError;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const permanent = req.nextUrl.searchParams.get("permanent") === "true";
  if (permanent) {
    if (session!.role !== "super_admin") return NextResponse.json({ ok: false, error: "Only a super admin can permanently delete publications." }, { status: 403 });
    const deleted = await glashMaybeOne<{ status: string }>(`select status from public.blog_posts where id = $1`, [id]);
    if (deleted?.status !== "deleted") return NextResponse.json({ ok: false, error: "Move the publication to Deleted before permanent removal." }, { status: 409 });
    await glashQuery(`delete from public.blog_posts where id = $1`, [id]);
  } else {
    await glashQuery(
      `update public.blog_posts set status = 'deleted', deleted_at = now(), deleted_by = $2, updated_at = now() where id = $1`,
      [id, session!.email],
    );
  }
  await logActivity({
    action: permanent ? "intelligence.delete_permanently" : "intelligence.soft_delete",
    page: "intelligence", resource_type: "intelligence_publication", resource_id: id,
  });
  return NextResponse.json({ ok: true });
}
