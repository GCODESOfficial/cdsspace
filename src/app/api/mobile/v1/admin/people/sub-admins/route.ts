import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creates a sub-admin account for the app's /admin/sub-admins "New Sub-Admin"
 * form. The web page inserts this row from the browser; the row is the same
 * (name, email, password, permissions, is_active) so /api/admin/sub-admins/invite
 * and /api/admin-invite/redeem work on it unchanged (the password is hashed on
 * the sub-admin's first sign-in, as for web-created rows).
 * Body: { name, email, password, permissions: string[] } → { ok, sub_admin: { id, name, email } }
 */
export async function POST(req: NextRequest) {
  const { denied } = await requireAdmin(req, "sub_admins.create");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "").trim();
  const permissions: string[] = Array.isArray(body?.permissions)
    ? Array.from(new Set(body.permissions.map((p: unknown) => String(p || "").trim()).filter(Boolean)))
    : [];

  if (!name || !email || !password) {
    return NextResponse.json({ ok: false, error: "All fields are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (permissions.length === 0) {
    return NextResponse.json({ ok: false, error: "Select at least one permission" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = getSupabaseAdmin() as any;
  const { data, error } = await sb
    .from("sub_admins")
    .insert({ name, email, password, permissions, is_active: true })
    .select("id, name, email")
    .single();
  if (error || !data) {
    const message = String(error?.message || "");
    return NextResponse.json(
      { ok: false, error: message.includes("duplicate") ? "Email already exists" : message || "Failed to create" },
      { status: message.includes("duplicate") ? 409 : 500 },
    );
  }

  await logActivity({
    action: "sub_admin.create",
    page: "sub-admins",
    resource_type: "sub_admin",
    resource_id: data.id,
    resource_label: data.name,
    metadata: { email, permissions },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, sub_admin: data });
}
