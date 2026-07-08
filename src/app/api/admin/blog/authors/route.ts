import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery, glashOne } from "@/lib/glashdb/postgres";

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
  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
  const author = await glashOne(
    `insert into public.blog_authors (name, photo_url, position, bio, social_links)
     values ($1,$2,$3,$4,$5::jsonb) returning *`,
    [b.name.trim(), b.photo_url || null, b.position || null, b.bio || null, JSON.stringify(b.social_links || {})],
  );
  return NextResponse.json({ ok: true, author });
}

export async function PATCH(req: NextRequest) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  const author = await glashOne(
    `update public.blog_authors set
       name = coalesce($2, name), photo_url = $3, position = $4, bio = $5,
       social_links = coalesce($6::jsonb, social_links), updated_at = now()
     where id = $1 returning *`,
    [b.id, b.name?.trim() || null, b.photo_url || null, b.position || null, b.bio || null, b.social_links ? JSON.stringify(b.social_links) : null],
  );
  return NextResponse.json({ ok: true, author });
}

export async function DELETE(req: NextRequest) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  await glashQuery(`delete from public.blog_authors where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
