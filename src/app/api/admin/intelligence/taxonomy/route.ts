import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery, glashMaybeOne } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin, cleanText } from "@/lib/intelligence/security";
import { slugify } from "@/lib/blog/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function canManage(session: AdminSession) { return session.role === "super_admin" || hasPermission(session.permissions, "blog"); }
async function admin() { const session = await getAdminSession(); return session && canManage(session) ? session : null; }

export async function GET() {
  if (!await admin()) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const [categories, tags, series] = await Promise.all([
    glashQuery(`select * from public.intelligence_categories order by sort_order, name`),
    glashQuery(`select * from public.intelligence_tags order by name`),
    glashQuery(`select * from public.intelligence_series order by name`),
  ]);
  return NextResponse.json({ ok: true, categories, tags, series });
}

export async function POST(req: NextRequest) {
  if (!await admin()) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || ""); const name = cleanText(body.name, 100); const slug = slugify(body.slug || name);
  if (!name || !["category", "tag", "series"].includes(kind)) return NextResponse.json({ ok: false, error: "Name and taxonomy type are required" }, { status: 400 });
  const table = kind === "category" ? "intelligence_categories" : kind === "tag" ? "intelligence_tags" : "intelligence_series";
  const row = await glashMaybeOne(`insert into public.${table} (name, slug${kind === "tag" ? "" : ", description"}) values ($1,$2${kind === "tag" ? "" : ",$3"}) on conflict (slug) do update set name = excluded.name returning *`, kind === "tag" ? [name, slug] : [name, slug, cleanText(body.description, 1000) || null]);
  return NextResponse.json({ ok: true, item: row });
}

export async function DELETE(req: NextRequest) {
  if (!await admin()) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  const kind = req.nextUrl.searchParams.get("kind"); const id = req.nextUrl.searchParams.get("id");
  if (!id || !kind || !["category", "tag", "series"].includes(kind)) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  const table = kind === "category" ? "intelligence_categories" : kind === "tag" ? "intelligence_tags" : "intelligence_series";
  if (kind === "tag") await glashQuery(`delete from public.${table} where id = $1`, [id]);
  else await glashQuery(`update public.${table} set is_active = false, updated_at = now() where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
