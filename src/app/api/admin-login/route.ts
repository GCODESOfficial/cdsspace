import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const SUPER_ADMIN_EMAIL = "ceo@cdsspace.pro";
const SUPER_ADMIN_PASSWORD = "globalcds1";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  // 1. Check super admin
  if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD) {
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
