import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { logActivity } from "@/lib/activity-log";
import { OBJECTIVE_QUESTION_COUNT } from "@/lib/screening-auth";
import { getRoleQuestions, replaceRoleQuestions } from "@/lib/screening-questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function can(session: AdminSession, key: string) {
  return session.role === "super_admin" || hasPermission(session.permissions, key);
}
async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) return { denied: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!can(session, "applicants.screening")) return { denied: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  return { denied: null as NextResponse | null };
}

/** GET ?role_id= → the full question bank for a role (with correct answers). */
export async function GET(req: NextRequest) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const roleId = req.nextUrl.searchParams.get("role_id");
  if (!roleId) return NextResponse.json({ ok: false, error: "Missing role_id" }, { status: 400 });

  const rows = await getRoleQuestions(roleId);
  return NextResponse.json({ ok: true, questions: rows, expected_count: OBJECTIVE_QUESTION_COUNT });
}

/** POST { role_id, questions[] } → replace the role's question bank. */
export async function POST(req: NextRequest) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const roleId = String(body?.role_id || "");
  if (!roleId) return NextResponse.json({ ok: false, error: "Missing role_id" }, { status: 400 });

  const incoming = Array.isArray(body?.questions) ? body.questions : [];
  const result = await replaceRoleQuestions(roleId, incoming);
  if (!result.ok) return NextResponse.json(result, { status: 400 });

  await logActivity({ action: "screening.questions.save", page: "screening", resource_type: "open_role", resource_label: `${result.count} questions`, metadata: { role_id: roleId, count: result.count } });
  return NextResponse.json(result);
}
