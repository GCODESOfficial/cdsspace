import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { getClientChatAdminActor } from "@/lib/client-chat-admin";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Toggle a reaction on a chat message.
 * Body: { emoji: string }
 * Response: { reactions: { [emoji]: string[] } }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getClientChatAdminActor("messages.send");
    const userSession = await verifyUser();
    if (!admin && !userSession) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = admin
      ? `admin:${admin.email || admin.id}`
      : userSession?.user.id
        ? `client:${userSession.user.id}`
        : null;
    if (!userId) return NextResponse.json({ error: "No user" }, { status: 401 });

    const { id } = await params;
    const { emoji } = await req.json();
    if (!emoji || typeof emoji !== "string") {
      return NextResponse.json({ error: "emoji required" }, { status: 400 });
    }

    if (!supabaseAdmin) return NextResponse.json({ error: "DB not configured" }, { status: 500 });

    // Load existing reactions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabaseAdmin as any;
    const { data: msg, error: getErr } = await sb
      .from("chat_messages")
      .select("reactions, room_id")
      .eq("id", id)
      .single();
    if (getErr || !msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    // Clients can only react in their own room
    if (!admin && userSession) {
      const expected = `client_${userSession.user.id}`;
      if (msg.room_id !== expected) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const reactions: Record<string, string[]> = msg.reactions ?? {};
    const list = new Set(reactions[emoji] ?? []);
    if (list.has(userId)) list.delete(userId);
    else list.add(userId);
    if (list.size === 0) delete reactions[emoji];
    else reactions[emoji] = Array.from(list);

    const { error: upErr } = await sb
      .from("chat_messages")
      .update({ reactions })
      .eq("id", id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ reactions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
