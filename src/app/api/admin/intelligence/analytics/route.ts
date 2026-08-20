import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery, glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function canManage(session: AdminSession) { return session.role === "super_admin" || hasPermission(session.permissions, "blog"); }

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !canManage(session)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const days = Math.max(1, Math.min(730, Number(req.nextUrl.searchParams.get("days")) || 30));
  const slug = req.nextUrl.searchParams.get("slug") || "";
  const publicationType = req.nextUrl.searchParams.get("type") || "";
  const params = [days, slug, publicationType];
  const filter = `e.occurred_at >= now() - ($1::text || ' days')::interval
    and ($2 = '' or bp.slug = $2) and ($3 = '' or bp.publication_type = $3)`;
  const [totals, top, daily, sources, devices] = await Promise.all([
    glashMaybeOne(
      `select count(*) filter (where e.event_type = 'view')::int as views,
              count(distinct e.visitor_key) filter (where e.event_type = 'view')::int as unique_views,
              count(*) filter (where e.event_type = 'pdf_open')::int as pdf_opens,
              count(*) filter (where e.event_type = 'download')::int as downloads,
              count(*) filter (where e.event_type = 'share')::int as shares,
              count(*) filter (where e.event_type = 'cta_click')::int as cta_clicks,
              coalesce(avg(e.event_value) filter (where e.event_type = 'time_on_page'),0)::int as avg_time,
              coalesce(avg(e.event_value) filter (where e.event_type = 'scroll_depth'),0)::int as avg_scroll
       from public.intelligence_events e join public.blog_posts bp on bp.id = e.post_id where ${filter}`, params),
    glashQuery(
      `select bp.id, bp.slug, bp.title, bp.publication_type,
              count(*) filter (where e.event_type = 'view')::int as views,
              count(distinct e.visitor_key) filter (where e.event_type = 'view')::int as unique_views,
              count(*) filter (where e.event_type = 'cta_click')::int as cta_clicks
       from public.intelligence_events e join public.blog_posts bp on bp.id = e.post_id
       where ${filter} group by bp.id order by views desc limit 12`, params),
    glashQuery(
      `select to_char(date_trunc('day', e.occurred_at), 'YYYY-MM-DD') as date,
              count(*) filter (where e.event_type = 'view')::int as views,
              count(distinct e.visitor_key) filter (where e.event_type = 'view')::int as visitors
       from public.intelligence_events e join public.blog_posts bp on bp.id = e.post_id
       where ${filter} group by 1 order by 1`, params),
    glashQuery(
      `select coalesce(nullif(source,''),'Direct') as label, count(*)::int as value
       from public.intelligence_events e join public.blog_posts bp on bp.id = e.post_id
       where ${filter} and e.event_type = 'view' group by 1 order by value desc limit 8`, params),
    glashQuery(
      `select coalesce(device,'unknown') as label, count(*)::int as value
       from public.intelligence_events e join public.blog_posts bp on bp.id = e.post_id
       where ${filter} and e.event_type = 'view' group by 1 order by value desc`, params),
  ]);
  return NextResponse.json({ ok: true, days, totals: totals || {}, top, daily, sources, devices });
}
