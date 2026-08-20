import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin, cleanText } from "@/lib/intelligence/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function canManage(session: AdminSession) { return session.role === "super_admin" || hasPermission(session.permissions, "blog"); }

export async function GET() {
  const session = await getAdminSession();
  if (!session || !canManage(session)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const settings = await glashQuery(`select key, value, updated_at from public.intelligence_settings order by key`);
  return NextResponse.json({ ok: true, settings });
}

export async function PUT(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !canManage(session)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const key = cleanText(body.key, 80);
  if (!key || !body.value || typeof body.value !== "object") return NextResponse.json({ ok: false, error: "Invalid setting" }, { status: 400 });
  await glashQuery(
    `insert into public.intelligence_settings (key, value, updated_by) values ($1,$2::jsonb,$3)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [key, JSON.stringify(body.value), session.email],
  );
  return NextResponse.json({ ok: true });
}
