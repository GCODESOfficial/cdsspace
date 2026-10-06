import { NextRequest } from "next/server";
import { getAdminSession } from "@/app/api/admin-check/route";
import { insertActivityLog } from "@/lib/activity-log";
import { adminMobileJson } from "@/lib/admin-mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ends the app's admin session. The token is a signed claim set (as the web
// cookie is), so the app forgets it; this records the sign-out.
export async function POST(req: NextRequest) {
  const session = getAdminSession(req);
  if (session) {
    void insertActivityLog({
      actor_kind: "admin",
      actor_id: session.email,
      actor_name: session.name || session.email,
      actor_is_admin: true,
      action: "admin.logout",
      page: "logout",
      resource_type: "admin_session",
      resource_label: "Admin logout (app)",
      metadata: { source: "mobile_app" },
    }).catch(() => {});
  }
  return adminMobileJson({ ok: true });
}
