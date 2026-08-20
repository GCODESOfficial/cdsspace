/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getClientChatContext } from "@/lib/client-project-chat";
import { describeTeamMessage } from "@/lib/team-chat-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getClientChatContext();
  if (!context) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { account, db } = context;
  const userId = account.user.id;
  const roomId = `client_${userId}`;

  const [{ data: directLatest }, { count: directUnread }, { data: memberships }] = await Promise.all([
    db
      .from("chat_messages")
      .select("id, message, file_url, created_at, sender_role")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("sender_role", "admin")
      .eq("is_read", false),
    db
      .from("team_chat_client_participants")
      .select("thread_id, last_read_at, joined_at")
      .eq("client_user_id", userId),
  ]);

  const projectThreadIds = (memberships || []).map((row: any) => row.thread_id).filter(Boolean);
  let projectThreads: any[] = [];

  if (projectThreadIds.length) {
    const [{ data: threads }, { data: messages }] = await Promise.all([
      db
        .from("team_chat_threads")
        .select("id, name, kind, project_id, is_announcement_only, created_at")
        .in("id", projectThreadIds)
        .not("project_id", "is", null),
      db
        .from("team_chat_messages")
        .select("id, thread_id, body, attachment_url, sticker_key, deleted_at, sender_id, client_user_id, sender_is_admin, created_at")
        .in("thread_id", projectThreadIds)
        .order("created_at", { ascending: false }),
    ]);

    const membershipByThread = new Map((memberships || []).map((row: any) => [row.thread_id, row]));
    const latestByThread = new Map<string, any>();
    const unreadByThread = new Map<string, number>();

    for (const message of messages || []) {
      if (!latestByThread.has(message.thread_id)) latestByThread.set(message.thread_id, message);
      const membership = membershipByThread.get(message.thread_id) as any;
      const lastRead = membership?.last_read_at ? new Date(membership.last_read_at).getTime() : 0;
      if (message.client_user_id !== userId && new Date(message.created_at).getTime() > lastRead) {
        unreadByThread.set(message.thread_id, (unreadByThread.get(message.thread_id) || 0) + 1);
      }
    }

    projectThreads = (threads || []).map((thread: any) => {
      const last = latestByThread.get(thread.id) || null;
      return {
        id: thread.id,
        kind: "project" as const,
        name: thread.name || "Project chat",
        projectId: thread.project_id,
        isAnnouncementOnly: !!thread.is_announcement_only,
        lastMessage: last ? describeTeamMessage(last) : "No messages yet",
        lastMessageAt: last?.created_at || thread.created_at,
        unreadCount: unreadByThread.get(thread.id) || 0,
      };
    });
  }

  const threads = [
    {
      id: roomId,
      kind: "direct" as const,
      name: "CDS Space",
      projectId: null,
      isAnnouncementOnly: false,
      lastMessage: directLatest?.message || (directLatest?.file_url ? "Attachment" : "Message the CDS Space team"),
      lastMessageAt: directLatest?.created_at || null,
      unreadCount: directUnread || 0,
    },
    ...projectThreads,
  ].sort((a, b) => {
    if (a.kind === "direct" && !a.lastMessageAt) return -1;
    if (b.kind === "direct" && !b.lastMessageAt) return 1;
    return new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
  });

  return NextResponse.json({
    ok: true,
    threads,
    viewer: {
      id: userId,
      name: account.profile.full_name || account.profile.company_name || account.profile.email || "Client",
      avatarUrl: account.profile.avatar_url,
    },
  });
}

