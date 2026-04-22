/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { member_ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(member_ids)) return NextResponse.json({ ok: false, error: "member_ids required" }, { status: 400 });
  const db = supabaseAdmin as any;
  const { data: m } = await db.from("team_meetings").select("id").eq("room_code", code).maybeSingle();
  if (!m) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (member_ids.length === 0) return NextResponse.json({ ok: true, notified: 0 });

  // Hydrate meeting context for the notification body
  const { data: meeting } = await db
    .from("team_meetings")
    .select("id, title, room_code")
    .eq("room_code", code)
    .maybeSingle();

  const rows = member_ids.map((id: string) => ({ meeting_id: m.id, team_member_id: id }));
  await db
    .from("team_meeting_participants")
    .upsert(rows, { onConflict: "meeting_id,team_member_id" });

  // Don't self-notify the tagger
  const recipients = (member_ids as string[]).filter(
    (id) => id && (actor.kind !== "team" || id !== (actor as any).id)
  );

  const actorName =
    actor.kind === "team"
      ? (actor as any).full_name || (actor as any).username || "A teammate"
      : "CDS Space Admin";

  const link = `/meet/${code}`;
  const title =
    meeting?.title ? `${actorName} tagged you in “${meeting.title}”` : `${actorName} tagged you in a meeting`;

  if (recipients.length > 0) {
    await db.from("team_notifications").insert(
      recipients.map((rid) => ({
        recipient_id: rid,
        kind: "cmeet_tag",
        title,
        body: `Join the live room — code ${code}`,
        link,
        actor_member_id: actor.kind === "team" ? (actor as any).id : null,
        actor_is_admin: actor.kind === "admin",
        meeting_id: meeting?.id || m.id,
      }))
    );
  }

  return NextResponse.json({ ok: true, notified: recipients.length });
}
