import { NextResponse } from "next/server";
import { getClientChatAdminActor } from "@/lib/client-chat-admin";
import { setRoomArchived } from "@/lib/chat-room-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat/rooms/archive { roomId, archived } - the super admin archives
 * (or restores) a client conversation. Archived, the other admins no longer
 * see or answer it; the client and the super admin carry on as usual.
 */
export async function POST(request: Request) {
  const admin = await getClientChatAdminActor("messages.view");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (admin.role !== "super_admin") {
    return NextResponse.json({ error: "Only the super admin can archive conversations." }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { roomId?: unknown; archived?: unknown };
  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  if (!roomId || roomId.length > 200 || typeof body.archived !== "boolean") {
    return NextResponse.json({ error: "roomId and archived are required." }, { status: 400 });
  }
  await setRoomArchived(roomId, body.archived, admin.email || null);
  return NextResponse.json({ ok: true, archived: body.archived });
}
