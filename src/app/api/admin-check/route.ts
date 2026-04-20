import { NextRequest, NextResponse } from "next/server";

export interface AdminSession {
  role: "super_admin" | "sub_admin";
  email: string;
  name: string;
  permissions: string[];
}

export function getAdminSession(req: NextRequest): AdminSession | null {
  const cookie = req.cookies.get("admin_session");
  if (!cookie?.value) return null;

  try {
    const session = JSON.parse(cookie.value) as AdminSession;
    if (session.role && session.email) return session;
    // Backwards compat: old cookie was just "authenticated"
    if (cookie.value === "authenticated") {
      return { role: "super_admin", email: "ceo@cdsspace.pro", name: "Admin", permissions: ["all"] };
    }
    return null;
  } catch {
    // Old format fallback
    if (cookie.value === "authenticated") {
      return { role: "super_admin", email: "ceo@cdsspace.pro", name: "Admin", permissions: ["all"] };
    }
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = getAdminSession(req);

  if (session) {
    return NextResponse.json({
      authenticated: true,
      role: session.role,
      name: session.name,
      email: session.email,
      permissions: session.permissions,
    });
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
