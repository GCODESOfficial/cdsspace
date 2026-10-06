import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { adminMobileJson } from "@/lib/admin-mobile";
import { glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST { ids: string[], role_id: string | null }
 *
 * Moves applicants to another open role (or to no role). The app's applicant
 * menu offers this under the `applicants.assign_role` permission; the
 * applicant's screening row follows the application so it is grouped and
 * scheduled with its new role.
 */
export async function POST(req: NextRequest) {
  const { denied } = await requireAdmin(req, "applicants.assign_role");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String).filter((id: string) => UUID.test(id)) : [];
  if (!ids.length) return adminMobileJson({ ok: false, error: "No applicants selected" }, 400);
  const roleId = body?.role_id ? String(body.role_id) : null;
  if (roleId && !UUID.test(roleId)) return adminMobileJson({ ok: false, error: "Invalid role" }, 400);

  try {
    let roleTitle = "No role";
    if (roleId) {
      const roles = await glashQuery<{ title: string }>(`select title from public.open_roles where id = $1`, [roleId]);
      if (!roles.length) return adminMobileJson({ ok: false, error: "That role no longer exists" }, 404);
      roleTitle = roles[0].title;
    }
    await glashQuery(`update public.role_applications set role_id = $1 where id = any($2::uuid[])`, [roleId, ids]);
    await glashQuery(`update public.screening_candidates set role_id = $1 where application_id = any($2::uuid[])`, [roleId, ids]);
    await logActivity({
      action: "application.assign_role",
      page: "applications",
      resource_type: "role_application",
      resource_label: `${ids.length} → ${roleTitle}`,
      metadata: { role_id: roleId, count: ids.length },
    });
    return adminMobileJson({ ok: true });
  } catch (e) {
    return adminMobileJson({ ok: false, error: e instanceof Error ? e.message : "Could not assign the role" }, 500);
  }
}
