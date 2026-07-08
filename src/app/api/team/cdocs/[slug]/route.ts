/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

async function authedActor() {
  const admin = await getAdminSession();
  if (admin) return { admin, team: null };
  const team = await getTeamSession();
  return { admin: null, team };
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const { admin, team } = await authedActor();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const db = supabaseAdmin as any;

  const { data: doc } = await db
    .from("team_cdocs")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Log the view (async - fire and forget is fine)
  db.from("team_cdocs_views")
    .insert({
      doc_id: doc.id,
      viewer_id: team?.id || null,
      viewer_is_admin: !!admin,
    })
    .then(() => {});

  const [stats, comments, mentions, versions, authorRes] = await Promise.all([
    db.from("v_team_cdocs_stats").select("*").eq("doc_id", doc.id).maybeSingle(),
    db
      .from("team_cdocs_comments")
      .select("*")
      .eq("doc_id", doc.id)
      .order("created_at", { ascending: true }),
    db
      .from("team_cdocs_mentions")
      .select("*")
      .eq("doc_id", doc.id)
      .order("created_at", { ascending: false }),
    db
      .from("team_cdocs_versions")
      .select("id, version, title, edited_by, edited_by_admin, created_at")
      .eq("doc_id", doc.id)
      .order("version", { ascending: false })
      .limit(50),
    doc.created_by
      ? db
          .from("team_members")
          .select("id, full_name, username, avatar_url")
          .eq("id", doc.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    ok: true,
    doc: { ...doc, author: authorRes.data },
    stats: stats.data || null,
    comments: comments.data || [],
    mentions: mentions.data || [],
    versions: versions.data || [],
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const { admin, team } = await authedActor();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const allowed = ["title", "body", "cover_emoji", "department", "tags", "is_pinned", "is_archived"];
  const updates: Record<string, any> = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  // Stamp editor for the version-snapshot trigger
  if (team) {
    updates.created_by = team.id;
    updates.created_by_admin = false;
  } else if (admin) {
    updates.created_by_admin = true;
  }

  const db = supabaseAdmin as any;
  const { error } = await db.from("team_cdocs").update(updates).eq("slug", slug);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Extract @mentions from the body and fire notifications
  if (typeof body.body === "string") {
    const usernames = Array.from(new Set(body.body.match(/@([a-z0-9._-]+)/gi) || []))
      .map((m) => (m as string).slice(1).toLowerCase());
    if (usernames.length > 0) {
      const { data: doc } = await db
        .from("team_cdocs")
        .select("id, title")
        .eq("slug", slug)
        .maybeSingle();
      if (doc) {
        const { data: matches } = await db
          .from("team_members")
          .select("id, username")
          .in("username", usernames)
          .eq("is_active", true);

        const mentions = (matches || []).map((m: any) => ({
          doc_id: doc.id,
          mentioned_member_id: m.id,
          mentioned_by: team?.id || null,
          mentioned_by_admin: !!admin,
        }));
        if (mentions.length > 0) {
          await db.from("team_cdocs_mentions").insert(mentions);
          await db.from("team_notifications").insert(
            (matches || []).map((m: any) => ({
              recipient_id: m.id,
              kind: "cdocs_tag",
              title: `You were mentioned in "${doc.title}"`,
              link: `/team/cdocs/${slug}`,
              actor_member_id: team?.id || null,
              actor_is_admin: !!admin,
              document_id: doc.id,
            }))
          );
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const { admin } = await authedActor();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  const { slug } = await params;

  const db = supabaseAdmin as any;
  const { error } = await db.from("team_cdocs").delete().eq("slug", slug);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
