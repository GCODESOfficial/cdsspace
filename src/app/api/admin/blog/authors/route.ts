import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery, glashOne } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin, cleanText, safePublicUrl } from "@/lib/intelligence/security";

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

export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const authors = await glashQuery(`select * from public.blog_authors order by name`);
  return NextResponse.json({ ok: true, authors });
}

export async function POST(req: NextRequest) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
  const author = await glashOne(
    `insert into public.blog_authors
       (name, photo_url, position, bio, social_links, role, expertise, contributor_type, is_external, organization, profile_url)
     values ($1,$2,$3,$4,$5::jsonb,$6,$7::text[],$8,$9,$10,$11) returning *`,
    [cleanText(b.name, 120), safePublicUrl(b.photo_url), cleanText(b.position, 160) || null, cleanText(b.bio, 3000) || null, JSON.stringify(b.social_links || {}), cleanText(b.role, 160) || null, Array.isArray(b.expertise) ? b.expertise.map((v: unknown) => cleanText(v, 80)).filter(Boolean).slice(0, 20) : [], cleanText(b.contributor_type, 40) || "author", Boolean(b.is_external), cleanText(b.organization, 180) || null, safePublicUrl(b.profile_url)],
  );
  return NextResponse.json({ ok: true, author });
}

export async function PATCH(req: NextRequest) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  const author = await glashOne(
    `update public.blog_authors set
       name = coalesce($2, name), photo_url = $3, position = $4, bio = $5,
       social_links = coalesce($6::jsonb, social_links), role = $7, expertise = $8::text[],
       contributor_type = coalesce($9, contributor_type), is_active = coalesce($10, is_active),
       is_external = coalesce($11, is_external), organization = $12, profile_url = $13, updated_at = now()
     where id = $1 returning *`,
    [b.id, cleanText(b.name, 120) || null, safePublicUrl(b.photo_url), cleanText(b.position, 160) || null, cleanText(b.bio, 3000) || null, b.social_links ? JSON.stringify(b.social_links) : null, cleanText(b.role, 160) || null, Array.isArray(b.expertise) ? b.expertise.map((v: unknown) => cleanText(v, 80)).filter(Boolean).slice(0, 20) : [], cleanText(b.contributor_type, 40) || null, "is_active" in b ? Boolean(b.is_active) : null, "is_external" in b ? Boolean(b.is_external) : null, cleanText(b.organization, 180) || null, safePublicUrl(b.profile_url)],
  );
  return NextResponse.json({ ok: true, author });
}

export async function DELETE(req: NextRequest) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  await glashQuery(`update public.blog_authors set is_active = false, updated_at = now() where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
