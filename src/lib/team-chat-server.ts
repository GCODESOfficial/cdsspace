/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/lib/supabase";
import { type ChatViewer, viewerDisplayName } from "@/lib/team-chat-auth";

export interface TeamChatViewerPayload {
  kind: "admin" | "team";
  id: string | null;
  displayName: string;
  reactionKey: string;
  // "Management" = admins + sub-admins. Used client-side to gate posting in
  // announcement-only channels (the server is the authoritative check).
  isManagement: boolean;
}

export interface TeamChatMessageRecord {
  id: string;
  thread_id: string;
  sender_id: string | null;
  client_user_id: string | null;
  sender_is_admin: boolean;
  body: string | null;
  attachment_url: string | null;
  forwarded: {
    original_sender_name: string;
    original_body: string;
    original_created_at: string | null;
    original_source: "client" | "team";
  } | null;
  reply_to_message_id: string | null;
  sticker_key: string | null;
  reactions: Record<string, string[]>;
  message_type?: string;
  delivery_status?: string;
  pinned_at?: string | null;
  pinned_by?: string | null;
  starred_by?: string[];
  bookmarked_by?: string[];
  scheduled_for?: string | null;
  sent_at?: string | null;
  thread_root_id?: string | null;
  translated?: Record<string, string>;
  metadata?: Record<string, unknown>;
  audio_url?: string | null;
  audio_duration_seconds?: number | null;
  voice_transcript?: string | null;
  file_name?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export const TEAM_CHAT_MESSAGE_COLUMNS =
  "id, thread_id, sender_id, client_user_id, sender_is_admin, body, attachment_url, forwarded, reply_to_message_id, sticker_key, reactions, message_type, delivery_status, pinned_at, pinned_by, starred_by, bookmarked_by, scheduled_for, sent_at, thread_root_id, translated, metadata, audio_url, audio_duration_seconds, voice_transcript, file_name, file_size_bytes, mime_type, edited_at, deleted_at, created_at";

export function getTeamChatDb() {
  return supabaseAdmin as any;
}

export function getViewerReactionKey(viewer: ChatViewer) {
  return viewer.kind === "admin" ? `admin:${viewer.email}` : viewer.session.id;
}

export function getViewerPayload(viewer: ChatViewer): TeamChatViewerPayload {
  return {
    kind: viewer.kind,
    id: viewer.kind === "team" ? viewer.session.id : null,
    displayName: viewerDisplayName(viewer),
    reactionKey: getViewerReactionKey(viewer),
    isManagement: viewer.kind === "admin" || (viewer.kind === "team" && !!viewer.session.is_sub_admin),
  };
}

export async function canViewTeamThread(viewer: ChatViewer, threadId: string) {
  const db = getTeamChatDb();
  if (!db) return false;
  if (viewer.kind === "admin") return true;

  const [{ data: thread }, { data: part }] = await Promise.all([
    db.from("team_chat_threads").select("kind, visibility").eq("id", threadId).maybeSingle(),
    db
      .from("team_chat_participants")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("team_member_id", viewer.session.id)
      .maybeSingle(),
  ]);

  if (!thread) return false;
  if (part) return true;
  return thread.kind === "department" || thread.kind === "admin_broadcast" || thread.visibility === "public";
}

/**
 * File/media sharing is restricted to group spaces: department chats, project
 * group chats and any group/broadcast thread. It is blocked in 1-on-1 direct
 * chats between team members - EXCEPT when an admin/manager is in the thread
 * (includes_admin), where attachments stay allowed. Returns true when the
 * thread may NOT receive attachments.
 */
export async function isAttachmentRestrictedThread(threadId: string): Promise<boolean> {
  const db = getTeamChatDb();
  if (!db) return false;
  const { data: thread } = await db
    .from("team_chat_threads")
    .select("kind, includes_admin")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return false;
  return thread.kind === "direct" && !thread.includes_admin;
}

export function canEditTeamMessage(viewer: ChatViewer, message: TeamChatMessageRecord) {
  if (message.deleted_at) return false;
  if (viewer.kind === "admin") return message.sender_is_admin;
  return message.sender_id === viewer.session.id && !message.sender_is_admin;
}

export function canDeleteTeamMessage(viewer: ChatViewer, message: TeamChatMessageRecord) {
  if (message.deleted_at) return false;
  if (viewer.kind === "admin") return true;
  return message.sender_id === viewer.session.id && !message.sender_is_admin;
}

export function describeTeamMessage(message: Partial<TeamChatMessageRecord>) {
  if (message.deleted_at) return "Message deleted";
  if (message.sticker_key) return "Sent a sticker";
  if (message.attachment_url && !message.body) return "Sent an attachment";
  if (message.body?.trim()) return message.body.trim();
  if (message.attachment_url) return "Sent an attachment";
  return "Sent a message";
}

export async function hydrateTeamMessages(messages: TeamChatMessageRecord[]) {
  const db = getTeamChatDb();
  if (!db || messages.length === 0) return [];

  const replyIds = Array.from(
    new Set(messages.map((message) => message.reply_to_message_id).filter(Boolean)),
  ) as string[];

  const missingReplyIds = replyIds.filter(
    (replyId) => !messages.some((message) => message.id === replyId),
  );

  let replyMessages: TeamChatMessageRecord[] = [];
  if (missingReplyIds.length) {
    const { data } = await db
      .from("team_chat_messages")
      .select(TEAM_CHAT_MESSAGE_COLUMNS)
      .in("id", missingReplyIds);
    replyMessages = (data || []) as TeamChatMessageRecord[];
  }

  const relatedMessages = [...messages, ...replyMessages];
  const ids = Array.from(
    new Set(relatedMessages.map((message) => message.sender_id).filter(Boolean)),
  ) as string[];
  const clientIds = Array.from(
    new Set(relatedMessages.map((message) => message.client_user_id).filter(Boolean)),
  ) as string[];

  const nameById: Record<string, { name: string; avatar: string | null }> = {};
  if (ids.length) {
    const { data: members } = await db.from("team_members").select("id, full_name, avatar_url").in("id", ids);
    (members || []).forEach((member: any) => {
      nameById[member.id] = { name: member.full_name, avatar: member.avatar_url };
    });
  }

  const clientById: Record<string, { name: string; avatar: string | null }> = {};
  if (clientIds.length) {
    const { data: clients } = await db
      .from("profiles")
      .select("id, full_name, company_name, email, avatar_url")
      .in("id", clientIds);
    (clients || []).forEach((client: any) => {
      clientById[client.id] = {
        name: client.full_name || client.company_name || client.email || "Client",
        avatar: client.avatar_url || null,
      };
    });
  }

  const relatedById = new Map(
    relatedMessages.map((message) => [
      message.id,
      {
        ...message,
        sender_name: message.sender_is_admin
          ? "Admin"
          : message.client_user_id
            ? clientById[message.client_user_id]?.name || "Client"
            : nameById[message.sender_id || ""]?.name || "Member",
        sender_avatar: message.sender_is_admin
          ? null
          : message.client_user_id
            ? clientById[message.client_user_id]?.avatar || null
            : nameById[message.sender_id || ""]?.avatar || null,
      },
    ]),
  );

  return messages.map((message) => {
    const replySource = message.reply_to_message_id ? relatedById.get(message.reply_to_message_id) : null;
    return {
      ...relatedById.get(message.id),
      reply_to: replySource
        ? {
            id: replySource.id,
            sender_name: replySource.sender_name,
            body: replySource.body,
            attachment_url: replySource.attachment_url,
            sticker_key: replySource.sticker_key,
            deleted_at: replySource.deleted_at,
            created_at: replySource.created_at,
          }
        : null,
    };
  });
}
