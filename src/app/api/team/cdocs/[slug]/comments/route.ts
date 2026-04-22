/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const { body: commentBody, parent_comment_id, anchor } = body;
  if (!commentBody?.trim()) return NextResponse.json({ ok: false, error: "Body required" }, { status: 400 });

  const db = supabaseAdmin as any;
  const { data: doc } = await db.from("team_cdocs").select("id, title").eq("slug", slug).maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, error: "Doc not found" }, { status: 404 });

  const { data: comment, error } = await db
    .from("team_cdocs_comments")
    .insert({
      doc_id: doc.id,
      author_id: team?.id || null,
      author_is_admin: !!admin,
      parent_comment_id: parent_comment_id || null,
      anchor: anchor || null,
      body: commentBody.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Fire notifications for any @mentions inside the comment body
  const usernames = Array.from(
    new Set((commentBody.match(/@([a-z0-9._-]+)/gi) || []).map((m: string) => m.slice(1).toLowerCase()))
  ) as string[];
  if (usernames.length > 0) {
    const { data: matches } = await db
      .from("team_members")
      .select("id")
      .in("username", usernames)
      .eq("is_active", true);
    if (matches?.length) {
      await db.from("team_cdocs_mentions").insert(
        matches.map((m: any) => ({
          doc_id: doc.id,
          comment_id: comment.id,
          mentioned_member_id: m.id,
          mentioned_by: team?.id || null,
          mentioned_by_admin: !!admin,
        }))
      );
      await db.from("team_notifications").insert(
        matches.map((m: any) => ({
          recipient_id: m.id,
          kind: "cdocs_tag",
          title: `You were mentioned in a comment on "${doc.title}"`,
          link: `/team/cdocs/${slug}`,
          actor_member_id: team?.id || null,
          actor_is_admin: !!admin,
          document_id: doc.id,
        }))
      );
    }
  }

  return NextResponse.json({ ok: true, comment });
}

export async function PATCH(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id, resolved } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const db = supabaseAdmin as any;
  const updates = resolved
    ? { resolved_at: new Date().toISOString(), resolved_by: team?.id || null }
    : { resolved_at: null, resolved_by: null };

  const { error } = await db.from("team_cdocs_comments").update(updates).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
