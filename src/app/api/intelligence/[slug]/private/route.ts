import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin, cleanText, requestFingerprint } from "@/lib/intelligence/security";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in with the assigned client account." }, { status: 401 });
  if (!checkIntelligenceRateLimit(`private-report:${user.id}`, 10, 10 * 60_000).allowed) return NextResponse.json({ ok: false, error: "Please wait and try again." }, { status: 429 });
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const post = await glashMaybeOne<{ id: string; assigned_client_id: string | null }>(
    `select id, assigned_client_id from public.blog_posts where slug = $1 and access_level = 'private_client' and deleted_at is null`, [slug],
  );
  if (!post || post.assigned_client_id !== user.id) return NextResponse.json({ ok: false, error: "This assessment is not assigned to your account." }, { status: 403 });

  if (body.action === "acknowledge") {
    await glashQuery(
      `insert into public.intelligence_private_acknowledgements (post_id, user_id, ip_hash) values ($1,$2,$3)
       on conflict (post_id, user_id) do update set acknowledged_at = now(), ip_hash = excluded.ip_hash`,
      [post.id, user.id, requestFingerprint(req)],
    );
    await glashQuery(`update public.blog_posts set report_status = 'acknowledged', updated_at = now() where id = $1`, [post.id]);
    return NextResponse.json({ ok: true, acknowledgedAt: new Date().toISOString() });
  }
  if (body.action === "consultation") {
    await glashQuery(
      `insert into public.intelligence_assessment_requests (post_id, user_id, name, email, company, message)
       values ($1,$2,$3,$4,$5,$6)`,
      [post.id, user.id, cleanText(body.name || user.user_metadata?.full_name || user.email, 120), user.email || "", cleanText(body.company, 180) || null, cleanText(body.message, 3000) || null],
    );
    await glashQuery(`update public.blog_posts set report_status = 'consultation_requested', updated_at = now() where id = $1`, [post.id]);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
}
