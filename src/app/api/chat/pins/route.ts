import { NextResponse } from "next/server";
import { getToolActor } from "@/lib/team-tools-auth";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pinned chats for the signed-in team member or admin (WhatsApp's "Pin chat":
 * a whole conversation kept at the top of their list, not a message).
 *   GET  -> { pins: [{ conversation, pinnedAt }] }
 *   POST { conversation, pinned } -> pin or unpin, at most MAX_PINS at once.
 * conversation: 'team:<thread id>' or 'room:<client room id>'.
 */
const MAX_PINS = 3;
const CONVERSATION = /^(team|room):[A-Za-z0-9_.:@+-]{1,200}$/;

async function viewerKey() {
  const actor = await getToolActor().catch(() => null);
  if (!actor) return null;
  return actor.kind === "team" ? `team:${actor.id}` : `admin:${actor.memberId || actor.email}`;
}

export async function GET() {
  const viewer = await viewerKey();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await glashQuery<{ conversation_key: string; pinned_at: string }>(
    `select conversation_key, pinned_at::text from public.chat_pins where viewer_key = $1 order by pinned_at desc`,
    [viewer],
  );
  return NextResponse.json(
    { pins: rows.map((row) => ({ conversation: row.conversation_key, pinnedAt: row.pinned_at })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const viewer = await viewerKey();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { conversation?: unknown; pinned?: unknown };
  const conversation = typeof body.conversation === "string" ? body.conversation.trim() : "";
  if (!CONVERSATION.test(conversation) || typeof body.pinned !== "boolean") {
    return NextResponse.json({ error: "conversation and pinned are required." }, { status: 400 });
  }
  if (!body.pinned) {
    await glashQuery(`delete from public.chat_pins where viewer_key = $1 and conversation_key = $2`, [viewer, conversation]);
    return NextResponse.json({ ok: true });
  }
  const [{ count }] = await glashQuery<{ count: number }>(
    `select count(*)::int as count from public.chat_pins where viewer_key = $1 and conversation_key <> $2`,
    [viewer, conversation],
  );
  if (count >= MAX_PINS) {
    return NextResponse.json({ error: `You can pin up to ${MAX_PINS} chats. Unpin one first.` }, { status: 409 });
  }
  await glashQuery(
    `insert into public.chat_pins (viewer_key, conversation_key) values ($1, $2)
     on conflict (viewer_key, conversation_key) do update set pinned_at = now()`,
    [viewer, conversation],
  );
  return NextResponse.json({ ok: true });
}
