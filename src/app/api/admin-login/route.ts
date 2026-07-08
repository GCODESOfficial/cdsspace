import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { insertActivityLog } from "@/lib/activity-log";

const SUPER_ADMIN_EMAIL = "ceo@cdsspace.pro";
const SUPER_ADMIN_PASSWORD = "globalcds1";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const metadata = {
    source: "admin_login",
    user_agent: req.headers.get("user-agent") || null,
    ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
  };

  // 1. Check super admin
  if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD) {
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
    response.cookies.set("admin_session", JSON.stringify({
      role: "super_admin",
      email: SUPER_ADMIN_EMAIL,
      name: "Admin",
      permissions: ["all"],
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    return response;
  }

  // 2. Check sub-admins from database
  const { data: subAdmin, error } = await supabase
    .from("sub_admins")
    .select("*")
    .eq("email", email)
    .eq("password", password)
    .eq("is_active", true)
    .single();

  if (!error && subAdmin) {
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
    response.cookies.set("admin_session", JSON.stringify({
      role: "sub_admin",
      email: subAdmin.email,
      name: subAdmin.name,
      permissions: subAdmin.permissions || [],
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    return response;
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}
