/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function GET() {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = supabaseAdmin as any;
  const [overview, topDocs, topCdocs, activity, signStats] = await Promise.all([
    db.from("v_workspace_overview").select("*").maybeSingle(),
    db
      .from("v_team_docs_stats")
      .select("document_id, title, views, downloads, unique_viewers, last_opened_at")
      .order("views", { ascending: false })
      .limit(5),
    db
      .from("v_team_cdocs_stats")
      .select("doc_id, slug, title, views, unique_viewers, open_comments")
      .eq("is_archived", false)
      .order("views", { ascending: false })
      .limit(5),
    db
      .from("v_team_member_activity")
      .select("*")
      .order("cdocs_authored", { ascending: false })
      .limit(10),
    db.from("v_team_signatures_stats").select("*").limit(8),
  ]);

  return NextResponse.json({
    ok: true,
    overview: overview.data || null,
    top_protect_docs: topDocs.data || [],
    top_cdocs: topCdocs.data || [],
    member_activity: activity.data || [],
    signature_stats: signStats.data || [],
  });
}
