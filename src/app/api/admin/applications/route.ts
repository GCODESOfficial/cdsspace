import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["new", "reviewing", "shortlisted", "rejected", "hired"] as const;

function can(session: AdminSession, key: string) {
  // Granting the parent "applicants" covers every sub-action (hasPermission's
  // group fallback), so granular keys only ever narrow access for fine roles.
  return session.role === "super_admin" || hasPermission(session.permissions, key);
}

async function requireAdmin(key = "applicants.view") {
  const session = await getAdminSession();
  if (!session) return { session: null, denied: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!can(session, key)) return { session, denied: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  return { session, denied: null as NextResponse | null };
}

const ACTION_PERMISSION: Record<string, string> = {
  update_status: "applicants.update_status",
  archive: "applicants.archive",
  unarchive: "applicants.archive",
  delete: "applicants.delete",
};

const SELECT = `
  select ra.id, ra.full_name, ra.email, ra.phone, ra.location, ra.cover_letter,
         ra.portfolio_link, ra.resume_link, ra.work_links, ra.status, ra.admin_note,
         ra.tracking_code, ra.created_at, ra.status_updated_at,
         {ARCHIVE},
         ra.role_id, r.title as role_title, r.role_type as role_type, r.location as role_location
  from public.role_applications ra
  left join public.open_roles r on r.id = ra.role_id
  order by ra.created_at desc`;

export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  try {
    const rows = await glashQuery(SELECT.replace("{ARCHIVE}", "coalesce(ra.is_archived, false) as is_archived, ra.archived_at"));
    return NextResponse.json({ ok: true, applications: rows });
  } catch (e) {
    // Archive columns not migrated yet - degrade gracefully.
    if (e instanceof Error && /is_archived|archived_at/.test(e.message)) {
      const rows = await glashQuery(SELECT.replace("{ARCHIVE}", "false as is_archived, null::timestamptz as archived_at"));
      return NextResponse.json({ ok: true, applications: rows });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const { denied } = await requireAdmin(ACTION_PERMISSION[action] || "applicants.view");
  if (denied) return denied;

  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "No applicants selected" }, { status: 400 });

  try {
    if (action === "update_status") {
      const status = String(body.status || "");
      if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
        return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
      }
      await glashQuery(
        `update public.role_applications set status = $1, admin_note = coalesce($2, admin_note) where id = any($3::uuid[])`,
        [status, body.admin_note ?? null, ids],
      );
      await logActivity({ action: "application.status", page: "applications", resource_type: "role_application", resource_label: `${ids.length} → ${status}`, metadata: { status, count: ids.length } });
      return NextResponse.json({ ok: true });
    }

    if (action === "archive" || action === "unarchive") {
      const archived = action === "archive";
      await glashQuery(
        `update public.role_applications set is_archived = $1, archived_at = $2 where id = any($3::uuid[])`,
        [archived, archived ? new Date().toISOString() : null, ids],
      );
      await logActivity({ action: `application.${action}`, page: "applications", resource_type: "role_application", resource_label: `${ids.length} applicant(s)`, metadata: { count: ids.length } });
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      await glashQuery(`delete from public.role_applications where id = any($1::uuid[])`, [ids]);
      await logActivity({ action: "application.delete", page: "applications", resource_type: "role_application", resource_label: `${ids.length} applicant(s)`, metadata: { count: ids.length } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Action failed" }, { status: 500 });
  }
}
