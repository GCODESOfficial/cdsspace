import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { insertActivityLog } from "@/lib/activity-log";
import { adminSessionCookieOptions, signAdminCookie } from "@/lib/admin-session-cookie";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from "@/lib/security/email-blocklist";

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "ceo@cdsspace.pro";
// Never hardcode the secret in source. Set ADMIN_PASSWORD in the environment.
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (isBlockedEmail(email)) {
    return NextResponse.json({ ok: false, error: BLOCKED_EMAIL_MESSAGE }, { status: 403 });
  }
  const metadata = {
    source: "admin_login",
    user_agent: req.headers.get("user-agent") || null,
    ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
  };

  // 1. Check super admin. Require a configured password so a missing
  // ADMIN_PASSWORD can never authenticate an empty/blank password.
  if (SUPER_ADMIN_PASSWORD && email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD) {
    void insertActivityLog({
      actor_kind: "admin",
      actor_id: SUPER_ADMIN_EMAIL,
      actor_name: "Admin",
      actor_is_admin: true,
      action: "admin.login",
      page: "login",
      resource_type: "admin_session",
      resource_label: "Super admin login",
      metadata,
    }).catch((err) => console.error("[audit] admin login log failed:", err));

    const response = NextResponse.json({ success: true });
    response.cookies.set("admin_session", signAdminCookie({
      role: "super_admin",
      email: SUPER_ADMIN_EMAIL,
      name: "Admin",
      permissions: ["all"],
      issuedAt: new Date().toISOString(),
    }), adminSessionCookieOptions());
    return response;
  }

  // 2. Check sub-admins from database. Look up by email only, then verify the
  // password in code - never send the plaintext password to the DB as a filter.
  const { data: subAdmin, error } = await supabase
    .from("sub_admins")
    .select("*")
    .eq("email", email)
    .eq("is_active", true)
    .single();

  const stored: string = subAdmin?.password || "";
  const isBcrypt = /^\$2[aby]\$/.test(stored);
  let passwordOk = false;
  if (!error && subAdmin && stored) {
    if (isBcrypt) {
      passwordOk = await bcrypt.compare(password, stored);
    } else {
      // Legacy plaintext row: verify, then transparently upgrade to a hash.
      passwordOk = password === stored;
      if (passwordOk) {
        try {
          const hash = await bcrypt.hash(password, 10);
          await supabase.from("sub_admins").update({ password: hash }).eq("email", subAdmin.email);
        } catch (err) {
          console.error("[auth] sub-admin password hash upgrade failed:", err);
        }
      }
    }
  }

  if (passwordOk && subAdmin) {
    const linkedTeamMember = await glashMaybeOne<{ id: string }>(
      `select id
         from public.team_members
        where lower(email) = lower($1)
          and is_active = true
          and is_sub_admin = true
        order by created_at asc
        limit 1`,
      [subAdmin.email],
    ).catch(() => null);

    void insertActivityLog({
      actor_kind: "admin",
      actor_id: subAdmin.email,
      actor_name: subAdmin.name || subAdmin.email,
      actor_is_admin: true,
      action: "admin.login",
      page: "login",
      resource_type: "admin_session",
      resource_label: "Sub-admin login",
      metadata: { ...metadata, role: "sub_admin" },
    }).catch((err) => console.error("[audit] sub-admin login log failed:", err));

    const response = NextResponse.json({ success: true });
    response.cookies.set("admin_session", signAdminCookie({
      role: "sub_admin",
      email: subAdmin.email,
      name: subAdmin.name,
      permissions: subAdmin.permissions || [],
      memberId: linkedTeamMember?.id,
      issuedAt: new Date().toISOString(),
    }), adminSessionCookieOptions());
    return response;
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}
