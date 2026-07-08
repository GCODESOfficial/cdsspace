import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery, glashOne, glashMaybeOne } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import { slugify, readingTimeMinutes, BLOG_STATUSES, type BlogStatus } from "@/lib/blog/constants";

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

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "post";
  let candidate = root;
  for (let i = 2; i < 50; i++) {
    const row = await glashMaybeOne<{ id: string }>(`select id from public.blog_posts where slug = $1 limit 1`, [candidate]);
    if (!row || row.id === excludeId) return candidate;
    candidate = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}

export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const posts = await glashQuery(
    `select bp.*, ba.name as author_name
     from public.blog_posts bp
     left join public.blog_authors ba on ba.id = bp.author_id
     where bp.status <> 'deleted'
     order by bp.updated_at desc`,
  );
  return NextResponse.json({ ok: true, posts });
}

function normaliseStatus(s: unknown): BlogStatus {
  return BLOG_STATUSES.includes(s as BlogStatus) ? (s as BlogStatus) : "draft";
}

export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (!b.title?.trim()) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });

  const status = normaliseStatus(b.status);
  const slug = await uniqueSlug(b.slug || b.title);
  const content = String(b.content || "");
  // Publish-now gets a timestamp; scheduled keeps the admin-chosen time.
  const publishedAt = status === "published" ? (b.published_at || new Date().toISOString())
    : status === "scheduled" ? (b.published_at || null) : (b.published_at || null);

  const post = await glashOne(
    `insert into public.blog_posts
      (slug, title, subtitle, excerpt, cover_url, category, tags, content, series,
       seo_title, seo_description, author_id, status, published_at, reading_time,
       sharing_enabled, reactions_enabled, created_by)
     values ($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     returning *`,
    [
      slug, b.title.trim(), b.subtitle || null, b.excerpt || null, b.cover_url || null,
      b.category || "Branding", Array.isArray(b.tags) ? b.tags : [], content, b.series || null,
      b.seo_title || null, b.seo_description || null, b.author_id || null, status, publishedAt,
      readingTimeMinutes(content), b.sharing_enabled !== false, b.reactions_enabled !== false, session!.email,
    ],
  );
  await logActivity({ action: "blog.create", page: "blog", resource_type: "blog_post", resource_id: (post as { id: string }).id, resource_label: b.title.trim(), metadata: { status } });
  return NextResponse.json({ ok: true, post });
}

export async function PATCH(req: NextRequest) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const current = await glashMaybeOne<{ id: string; slug: string; status: string; published_at: string | null }>(
    `select id, slug, status, published_at from public.blog_posts where id = $1`, [id],
  );
  if (!current) return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });

  const fields: Record<string, unknown> = {};
  const allowed = ["title", "subtitle", "excerpt", "cover_url", "category", "tags", "content", "series", "seo_title", "seo_description", "author_id", "sharing_enabled", "reactions_enabled"];
  for (const k of allowed) if (k in b) fields[k] = b[k];
  if ("content" in b) fields.reading_time = readingTimeMinutes(String(b.content || ""));
  if ("slug" in b && b.slug) fields.slug = await uniqueSlug(b.slug, id);

  if ("status" in b) {
    const status = normaliseStatus(b.status);
    fields.status = status;
    // First time going live without an explicit date → stamp now.
    if (status === "published" && !current.published_at && !b.published_at) fields.published_at = new Date().toISOString();
  }
  if ("published_at" in b) fields.published_at = b.published_at || null;

  const keys = Object.keys(fields);
  if (keys.length === 0) return NextResponse.json({ ok: true });

  const set = keys.map((k, i) => (k === "tags" ? `${k} = $${i + 2}::text[]` : `${k} = $${i + 2}`)).join(", ");
  const values = keys.map((k) => fields[k]);
  const post = await glashOne(
    `update public.blog_posts set ${set}, updated_at = now() where id = $1 returning *`,
    [id, ...values],
  );
  await logActivity({ action: "blog.update", page: "blog", resource_type: "blog_post", resource_id: id, resource_label: String(b.title || current.slug), metadata: { fields: keys } });
  return NextResponse.json({ ok: true, post });
}

export async function DELETE(req: NextRequest) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  await glashQuery(`delete from public.blog_posts where id = $1`, [id]);
  await logActivity({ action: "blog.delete", page: "blog", resource_type: "blog_post", resource_id: id });
  return NextResponse.json({ ok: true });
}
