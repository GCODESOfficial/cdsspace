import { NextResponse } from "next/server";
import { verifyAdmin, verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await verifyAdmin();
    const userSession = await verifyUser();

    if (!admin && !userSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const before = searchParams.get("before");

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 }
      );
    }

    // If client, only allow access to their own room
    if (!admin && userSession) {
      const expectedRoomId = `client_${userSession.user.id}`;
      if (roomId !== expectedRoomId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    let query = supabaseAdmin
      .from("chat_messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ messages: data });
  } catch (err) {
    console.error("GET /api/chat/messages error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = await verifyAdmin();
    const userSession = await verifyUser();

    if (!admin && !userSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { roomId, message, fileUrl } = body;

    if (!roomId || !message) {
      return NextResponse.json(
        { error: "roomId and message are required" },
        { status: 400 }
      );
    }

    const isAdmin = !!admin;
    const senderId = isAdmin ? admin.id : userSession!.user.id;
    const senderRole = isAdmin ? "admin" : "client";

    // If client, only allow sending to their own room
    if (!isAdmin) {
      const expectedRoomId = `client_${senderId}`;
      if (roomId !== expectedRoomId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Insert the chat message
    const { data: chatMessage, error: insertError } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        room_id: roomId,
        sender_id: senderId,
        sender_role: senderRole,
        message,
        file_url: fileUrl || null,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Create a notification for the other party
    if (isAdmin) {
      // Notify the client: extract userId from roomId "client_{userId}"
      const clientUserId = roomId.replace("client_", "");
      await supabaseAdmin.from("notifications").insert({
        user_id: clientUserId,
        type: "new_message",
        title: "New message from admin",
        message: message.length > 100 ? message.substring(0, 100) + "..." : message,
        link: "/chat",
      });
    } else {
      const { data: adminProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", "ceo@cdsspace.pro")
        .single();

      if (adminProfile) {
        await supabaseAdmin.from("notifications").insert({
          user_id: adminProfile.id,
          type: "new_message",
          title: "New message from client",
          message: message.length > 100 ? message.substring(0, 100) + "..." : message,
          link: `/chat?room=${roomId}`,
        });
      }
    }

    return NextResponse.json({ message: chatMessage });
  } catch (err) {
    console.error("POST /api/chat/messages error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
