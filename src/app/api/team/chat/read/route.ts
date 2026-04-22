/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getChatViewer } from "@/lib/team-chat-auth";

export const runtime = "nodejs";

// POST { threadId } — upsert the viewer's last_read_at for this thread.
export async function POST(req: Request) {
  const viewer = await getChatViewer();
  if (!viewer || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (viewer.kind !== "team") return NextResponse.json({ ok: true }); // admin has no per-thread read state

  const { threadId } = await req.json().catch(() => ({}));
  if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });

  const db = supabaseAdmin as any;
  const now = new Date().toISOString();
  const { error } = await db
    .from("team_chat_participants")
    .upsert(
      { thread_id: threadId, team_member_id: viewer.session.id, last_read_at: now },
      { onConflict: "thread_id,team_member_id" }
    );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
