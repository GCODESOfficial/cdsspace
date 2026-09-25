import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { cleanText } from "@/lib/intelligence/security";
import { intelligenceViewer, trustedClientMutation } from "@/lib/intelligence/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = Promise<{ commentId: string }>;

async function userForMutation(req: NextRequest) {
  if (!(await trustedClientMutation(req))) return null;
  const supabase = await createClient();
  const user = await intelligenceViewer(supabase);
  return user;
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const user = await userForMutation(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { commentId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "edit");

  if (action === "like") {
    const existing = await glashMaybeOne(`select comment_id from public.intelligence_comment_likes where comment_id = $1 and user_id = $2`, [commentId, user.id]);
    if (existing) await glashQuery(`delete from public.intelligence_comment_likes where comment_id = $1 and user_id = $2`, [commentId, user.id]);
    else await glashQuery(`insert into public.intelligence_comment_likes (comment_id, user_id) values ($1,$2) on conflict do nothing`, [commentId, user.id]);
    const row = await glashMaybeOne<{ likes_count: number }>(
      `update public.intelligence_comments set likes_count = (select count(*) from public.intelligence_comment_likes where comment_id = $1) where id = $1 returning likes_count`,
      [commentId],
    );
    return NextResponse.json({ ok: true, likes: row?.likes_count || 0, mine: !existing });
  }
  if (action === "report") {
    await glashQuery(
      `insert into public.intelligence_comment_reports (comment_id, user_id, reason) values ($1,$2,$3)
       on conflict (comment_id, user_id) do update set reason = excluded.reason`,
      [commentId, user.id, cleanText(body.reason, 300) || null],
    );
    await glashQuery(`update public.intelligence_comments set reports_count = (select count(*) from public.intelligence_comment_reports where comment_id = $1) where id = $1`, [commentId]);
    return NextResponse.json({ ok: true });
  }

  const text = cleanText(body.body, 4000);
  if (text.length < 2) return NextResponse.json({ ok: false, error: "Comment is too short." }, { status: 400 });
  const comment = await glashMaybeOne(
    `update public.intelligence_comments set body = $3, edited_at = now(), updated_at = now()
     where id = $1 and user_id = $2 and deleted_at is null returning id, body, edited_at`,
    [commentId, user.id, text],
  );
  if (!comment) return NextResponse.json({ ok: false, error: "Comment not found." }, { status: 404 });
  return NextResponse.json({ ok: true, comment });
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const user = await userForMutation(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { commentId } = await params;
  const comment = await glashMaybeOne<{ post_id: string }>(
    `update public.intelligence_comments set status = 'deleted', body = '[Comment deleted]', deleted_at = now(), updated_at = now()
     where id = $1 and user_id = $2 and deleted_at is null returning post_id`,
    [commentId, user.id],
  );
  if (!comment) return NextResponse.json({ ok: false, error: "Comment not found." }, { status: 404 });
  await glashQuery(`update public.blog_posts set comments_count = (select count(*) from public.intelligence_comments where post_id = $1 and status = 'approved' and deleted_at is null) where id = $1`, [comment.post_id]);
  return NextResponse.json({ ok: true });
}
