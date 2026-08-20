import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery, glashMaybeOne } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin, cleanText } from "@/lib/intelligence/security";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function canManage(session: AdminSession) { return session.role === "super_admin" || hasPermission(session.permissions, "blog"); }

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !canManage(session)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const status = req.nextUrl.searchParams.get("status") || "all";
  const search = cleanText(req.nextUrl.searchParams.get("search"), 120);
  const comments = await glashQuery(
    `select c.*, bp.title as publication_title, bp.slug as publication_slug,
            p.full_name as author_name, p.email as author_email
     from public.intelligence_comments c
     join public.blog_posts bp on bp.id = c.post_id
     left join public.profiles p on p.id = c.user_id
     where ($1 = 'all' or c.status = $1)
       and ($2 = '' or c.body ilike '%' || $2 || '%' or coalesce(p.full_name,'') ilike '%' || $2 || '%' or bp.title ilike '%' || $2 || '%')
     order by c.reports_count desc, c.created_at desc limit 500`,
    [status, search],
  );
  return NextResponse.json({ ok: true, comments });
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !canManage(session)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const commentId = String(body.commentId || "");
  const action = String(body.action || "");
  const nextStatus: Record<string, string> = { approve: "approved", hide: "hidden", delete: "deleted", restore: "approved" };
  if (!commentId || !nextStatus[action]) return NextResponse.json({ ok: false, error: "Invalid moderation action" }, { status: 400 });
  const current = await glashMaybeOne<{ status: string; post_id: string }>(`select status, post_id from public.intelligence_comments where id = $1`, [commentId]);
  if (!current) return NextResponse.json({ ok: false, error: "Comment not found" }, { status: 404 });
  await glashQuery(
    `update public.intelligence_comments set status = $2, deleted_at = case when $2 = 'deleted' then now() else null end, updated_at = now() where id = $1`,
    [commentId, nextStatus[action]],
  );
  await glashQuery(
    `insert into public.intelligence_moderation_log (comment_id, action, previous_status, next_status, reason, actor_email)
     values ($1,$2,$3,$4,$5,$6)`,
    [commentId, action, current.status, nextStatus[action], cleanText(body.reason, 500) || null, session.email],
  );
  await glashQuery(`update public.blog_posts set comments_count = (select count(*) from public.intelligence_comments where post_id = $1 and status = 'approved' and deleted_at is null) where id = $1`, [current.post_id]);
  await logActivity({ action: `intelligence.comment_${action}`, page: "intelligence", resource_type: "intelligence_comment", resource_id: commentId });
  return NextResponse.json({ ok: true });
}
