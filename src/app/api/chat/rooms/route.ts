import { NextResponse } from "next/server";
import { verifyAdmin, verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await verifyAdmin();
    const userSession = await verifyUser();

    if (!admin && !userSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = !!admin;

    if (isAdmin) {
      // Admin: list all unique rooms with latest message, unread count, and client profile
      const { data: messages, error: messagesError } = await supabaseAdmin
        .from("chat_messages")
        .select("room_id, message, created_at, sender_role, is_read")
        .order("created_at", { ascending: false });

      if (messagesError) {
        return NextResponse.json(
          { error: messagesError.message },
          { status: 500 }
        );
      }

      // Group by room_id
      const roomMap = new Map<
        string,
        {
          roomId: string;
          lastMessage: string;
          lastMessageAt: string;
          unreadCount: number;
        }
      >();

      for (const msg of messages || []) {
        if (!roomMap.has(msg.room_id)) {
          roomMap.set(msg.room_id, {
            roomId: msg.room_id,
            lastMessage: msg.message,
            lastMessageAt: msg.created_at,
            unreadCount: 0,
          });
        }

        // Count unread messages sent by the client (not yet read by admin)
        if (msg.sender_role === "client" && !msg.is_read) {
          const room = roomMap.get(msg.room_id)!;
          room.unreadCount += 1;
        }
      }

      // Fetch client profiles for each room
      const rooms = Array.from(roomMap.values());
      const clientIds = rooms.map((r) => r.roomId.replace("client_", ""));

      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", clientIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.id, p])
      );

      const roomsWithProfiles = rooms.map((room) => {
        const clientId = room.roomId.replace("client_", "");
        return {
          ...room,
          client: profileMap.get(clientId) || null,
        };
      });

      // Sort by latest message
      roomsWithProfiles.sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime()
      );

      return NextResponse.json({ rooms: roomsWithProfiles });
    } else {
      // Client: return just their room
      const userId = userSession!.user.id;
      const roomId = `client_${userId}`;

      const { data: latestMessage, error: msgError } = await supabaseAdmin
        .from("chat_messages")
        .select("message, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (msgError) {
        return NextResponse.json(
          { error: msgError.message },
          { status: 500 }
        );
      }

      const { count: unreadCount, error: countError } = await supabaseAdmin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId)
        .eq("sender_role", "admin")
        .eq("is_read", false);

      if (countError) {
        return NextResponse.json(
          { error: countError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        rooms: [
          {
            roomId,
            lastMessage: latestMessage?.message || null,
            lastMessageAt: latestMessage?.created_at || null,
            unreadCount: unreadCount || 0,
          },
        ],
      });
    }
  } catch (err) {
    console.error("GET /api/chat/rooms error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
