import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { getClientChatAdminActor } from "@/lib/client-chat-admin";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const admin = await getClientChatAdminActor("messages.view");
    const userSession = await verifyUser();

    if (!admin && !userSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { roomId } = body;

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 }
      );
    }

    const clientActorRequested = body.actor === "client";
    if (clientActorRequested && !userSession) {
      return NextResponse.json({ error: "Client session required" }, { status: 401 });
    }

    const isAdmin = !!admin && !clientActorRequested;

    // If client, only allow marking messages in their own room
    if (!isAdmin) {
      const expectedRoomId = `client_${userSession!.user.id}`;
      if (roomId !== expectedRoomId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Mark messages from the OTHER role as read
    const oppositeRole = isAdmin ? "client" : "admin";

    const { error } = await supabaseAdmin
      .from("chat_messages")
      .update({ is_read: true })
      .eq("room_id", roomId)
      .eq("sender_role", oppositeRole)
      .eq("is_read", false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/chat/read error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
