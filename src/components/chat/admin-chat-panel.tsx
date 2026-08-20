"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";
import { validateChatUpload } from "@/lib/chat-upload-limits";
import {
  MessageSquare,
  Send,
  User,
  ChevronLeft,
  Forward,
  X,
  Search,
  Loader2,
  CornerDownRight,
  Pin,
  Star,
  Bookmark,
  Languages,
  Paperclip,
  Phone,
  Video,
  MessageSquarePlus,
  PenLine,
  Save,
  Reply,
  SmilePlus,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Linkified, LinkPreview, firstUrl } from "@/components/chat/message-links";
import { ChatSidebarPreview } from "@/components/chat/chat-sidebar-preview";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const EmbeddedMeetingPanel = dynamic(
  () => import("@/components/chat/EmbeddedMeetingPanel").then((module) => module.EmbeddedMeetingPanel),
  { ssr: false },
);

type MessageSource = "web" | "whatsapp_cloud" | "whatsapp_qr" | "instagram" | "facebook";

interface ChatRoom {
  roomId: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  source?: MessageSource;
  client?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  whatsapp?: {
    phone: string;
    display_name: string | null;
    wa_name: string | null;
    linked_client_id: string | null;
  } | null;
  meta?: {
    platform: "facebook" | "instagram";
    external_user_id: string;
    display_name: string | null;
    username: string | null;
    linked_client_id: string | null;
  } | null;
}

interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  sender_role: "admin" | "client";
  message: string;
  file_url?: string;
  created_at: string;
  is_read: boolean;
  pinned_at?: string | null;
  starred_by?: string[];
  bookmarked_by?: string[];
  translated?: Record<string, string>;
  edited_at?: string | null;
  deleted_at?: string | null;
  source?: MessageSource;
  forwarded?: {
    original_sender_name: string;
    original_body: string;
    original_source: "client" | "team";
  } | null;
  reactions?: Record<string, string[]>;
  reply_to_message_id?: string | null;
}

function isChatImageUrl(url: string | undefined) {
  if (!url) return false;
  try {
    return /\.(png|jpe?g|webp|gif)$/i.test(new URL(url, window.location.origin).pathname);
  } catch {
    return false;
  }
}

function SourceBadge({ source }: { source?: MessageSource }) {
  const s = source || "web";
  const styles: Record<MessageSource, { bg: string; label: string }> = {
    web: { bg: "bg-gray-500/20 text-gray-300", label: "Web" },
    whatsapp_cloud: { bg: "bg-emerald-500/20 text-emerald-300", label: "WhatsApp" },
    whatsapp_qr: { bg: "bg-emerald-500/20 text-emerald-300", label: "WhatsApp" },
    instagram: { bg: "bg-pink-500/20 text-pink-300", label: "Instagram" },
    facebook: { bg: "bg-blue-500/20 text-blue-300", label: "Facebook" },
  };
  const { bg, label } = styles[s];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${bg}`}>
      {label}
    </span>
  );
}

interface TeamThreadLite {
  id: string;
  name: string | null;
  kind: string;
}

interface PlatformClientLite {
  platform_user_id: string;
  name: string;
  brand_name: string | null;
  email: string | null;
}

export function AdminChatPanel() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [startingCall, setStartingCall] = useState<"voice" | "video" | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<{ url: string; title: string } | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientPickerLoading, setClientPickerLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [platformClients, setPlatformClients] = useState<PlatformClientLite[]>([]);
  const [showWelcomeEditor, setShowWelcomeEditor] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [welcomeActive, setWelcomeActive] = useState(true);
  const [welcomeLoading, setWelcomeLoading] = useState(false);
  const [welcomeSaving, setWelcomeSaving] = useState(false);
  const [welcomeBackfillBusy, setWelcomeBackfillBusy] = useState(false);
  const [welcomeUpdatedAt, setWelcomeUpdatedAt] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [isAtLatest, setIsAtLatest] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const isAtLatestRef = useRef(true);
  const initialScrollPending = useRef(true);
  const renderedLastMessageId = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkedRoomHandled = useRef(false);
  const roomsRequestActive = useRef(false);
  const messagesRequestActive = useRef(false);
  const roomsSnapshot = useRef("");
  const messagesSnapshot = useRef("");

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    if (roomsRequestActive.current) return;
    roomsRequestActive.current = true;
    try {
      const res = await fetch("/api/chat/rooms");
      if (!res.ok) return;
      const data = await res.json();
      const nextRooms = data.rooms || [];
      const snapshot = JSON.stringify(nextRooms);
      if (snapshot !== roomsSnapshot.current) {
        roomsSnapshot.current = snapshot;
        setRooms(nextRooms);
      }
    } catch (err) {
      console.error("Failed to fetch rooms:", err);
    } finally {
      roomsRequestActive.current = false;
      setIsLoadingRooms(false);
    }
  }, []);

  // Fetch messages for selected room
  const fetchMessages = useCallback(async () => {
    if (!selectedRoom || messagesRequestActive.current) return;
    messagesRequestActive.current = true;
    try {
      const res = await fetch(
        `/api/chat/messages?roomId=${selectedRoom}&limit=50`
      );
      if (!res.ok) return;
      const data = await res.json();
      const nextMessages = data.messages || [];
      const snapshot = JSON.stringify(nextMessages);
      if (snapshot !== messagesSnapshot.current) {
        messagesSnapshot.current = snapshot;
        setMessages(nextMessages);
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      messagesRequestActive.current = false;
      setIsLoadingMessages(false);
    }
  }, [selectedRoom]);

  // Initial rooms fetch + polling
  useEffect(() => {
    fetchRooms();
    const interval = setInterval(() => { if (!document.hidden) fetchRooms(); }, 8000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  // Email escalations deep-link to the exact waiting conversation.
  useEffect(() => {
    if (linkedRoomHandled.current || rooms.length === 0) return;
    linkedRoomHandled.current = true;
    const requestedRoom = new URLSearchParams(window.location.search).get("room");
    if (requestedRoom && rooms.some((room) => room.roomId === requestedRoom)) {
      setSelectedRoom(requestedRoom);
      setMobileShowThread(true);
    }
  }, [rooms]);

  // Fetch messages when room changes + polling
  useEffect(() => {
    if (selectedRoom) {
      initialScrollPending.current = true;
      renderedLastMessageId.current = null;
      isAtLatestRef.current = true;
      setIsAtLatest(true);
      setNewMessageCount(0);
      messagesSnapshot.current = "";
      setIsLoadingMessages(true);
      fetchMessages();
    }
    const interval = setInterval(() => { if (!document.hidden) fetchMessages(); }, 8000);
    return () => clearInterval(interval);
  }, [selectedRoom, fetchMessages]);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    isAtLatestRef.current = true;
    setIsAtLatest(true);
    setNewMessageCount(0);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    isAtLatestRef.current = nearBottom;
    setIsAtLatest(nearBottom);
    if (nearBottom) setNewMessageCount(0);
  }, []);

  useEffect(() => {
    const last = messages.at(-1);
    if (!last) return;
    const changed = renderedLastMessageId.current !== last.id;
    renderedLastMessageId.current = last.id;
    if (initialScrollPending.current) {
      initialScrollPending.current = false;
      requestAnimationFrame(() => scrollToLatest("auto"));
      return;
    }
    if (!changed) return;
    if (isAtLatestRef.current || last.sender_role === "admin") requestAnimationFrame(() => scrollToLatest(last.sender_role === "admin" ? "smooth" : "auto"));
    else setNewMessageCount((count) => count + 1);
  }, [messages, scrollToLatest]);

  useEffect(() => {
    const count = messages.filter((message) => Boolean(message.pinned_at) && !message.deleted_at).length;
    setPinnedIndex((current) => count ? Math.min(current, count - 1) : 0);
  }, [messages]);

  // Mark as read when selecting a room
  useEffect(() => {
    if (!selectedRoom) return;
    fetch("/api/chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: selectedRoom }),
    }).then(() => {
      setRooms((prev) =>
        prev.map((r) =>
          r.roomId === selectedRoom ? { ...r, unreadCount: 0 } : r
        )
      );
    });
  }, [selectedRoom]);

  const handleSelectRoom = (roomId: string) => {
    setSelectedRoom(roomId);
    setPinnedIndex(0);
    setMobileShowThread(true);
    setTimeout(() => inputRef.current?.focus(), 200);
  };

  const openClientPicker = async () => {
    setShowClientPicker(true);
    setClientPickerLoading(true);
    try {
      const response = await fetch("/api/admin/clients/directory", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load clients");
      const unique = new Map<string, PlatformClientLite>();
      for (const client of payload.clients || []) {
        if (!client.has_platform_account || !client.platform_user_id) continue;
        unique.set(client.platform_user_id, {
          platform_user_id: client.platform_user_id,
          name: client.name || client.brand_name || client.email || "Client",
          brand_name: client.brand_name || null,
          email: client.email || null,
        });
      }
      setPlatformClients(Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not load clients");
      setShowClientPicker(false);
    } finally {
      setClientPickerLoading(false);
    }
  };

  const beginClientConversation = (client: PlatformClientLite) => {
    const roomId = `client_${client.platform_user_id}`;
    setRooms((current) => {
      if (current.some((room) => room.roomId === roomId)) return current;
      return [{
        roomId,
        lastMessage: "",
        lastMessageAt: "",
        unreadCount: 0,
        source: "web",
        client: {
          id: client.platform_user_id,
          email: client.email || "",
          full_name: client.name,
          avatar_url: null,
        },
      }, ...current];
    });
    setShowClientPicker(false);
    setClientSearch("");
    handleSelectRoom(roomId);
  };

  const openWelcomeEditor = async () => {
    setShowWelcomeEditor(true);
    setWelcomeLoading(true);
    try {
      const response = await fetch("/api/admin/chat/welcome-message", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load the welcome message");
      setWelcomeMessage(payload.setting?.message || "");
      setWelcomeActive(payload.setting?.is_active !== false);
      setWelcomeUpdatedAt(payload.setting?.updated_at || null);
    } catch (error) {
      setShowWelcomeEditor(false);
      await appAlert(error instanceof Error ? error.message : "Could not load the welcome message");
    } finally {
      setWelcomeLoading(false);
    }
  };

  const saveWelcomeMessage = async () => {
    if (welcomeMessage.trim().length < 50 || welcomeSaving) return;
    setWelcomeSaving(true);
    try {
      const response = await fetch("/api/admin/chat/welcome-message", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: welcomeMessage, is_active: welcomeActive }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save the welcome message");
      setWelcomeMessage(payload.setting.message);
      setWelcomeActive(payload.setting.is_active !== false);
      setWelcomeUpdatedAt(payload.setting.updated_at || null);
      setShowWelcomeEditor(false);
      await appAlert("The automatic client welcome message has been saved.");
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not save the welcome message");
    } finally {
      setWelcomeSaving(false);
    }
  };

  const sendWelcomeToExistingClients = async () => {
    if (welcomeBackfillBusy) return;
    const confirmed = await appConfirm({
      title: "Send welcome message to existing clients?",
      message: "Only clients who have not received the welcome in Chat/Meet or email will be contacted. Existing deliveries will not be duplicated.",
      confirmLabel: "Send welcome message",
    });
    if (!confirmed) return;
    setWelcomeBackfillBusy(true);
    try {
      const response = await fetch("/api/admin/chat/welcome-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backfill", limit: 100 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not send the welcome message");
      await appAlert(`Welcome delivery completed for ${payload.delivered || 0} existing client${payload.delivered === 1 ? "" : "s"}.${payload.failed ? ` ${payload.failed} delivery attempt(s) need retrying.` : ""}`);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not send the welcome message");
    } finally {
      setWelcomeBackfillBusy(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedRoom || isSending) return;

    const text = input.trim();
    const replyTarget = replyingTo;
    setInput("");
    setReplyingTo(null);
    setIsSending(true);

    // Optimistic update
    const optimisticMsg: ChatMessage = {
      id: `temp_${Date.now()}`,
      room_id: selectedRoom,
      sender_id: "admin",
      sender_role: "admin",
      message: text,
      created_at: new Date().toISOString(),
      is_read: false,
      reply_to_message_id: replyTarget?.id || null,
      reactions: {},
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    requestAnimationFrame(() => scrollToLatest("smooth"));

    try {
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: selectedRoom, message: text, replyToMessageId: replyTarget?.id || null }),
      });
      await fetchMessages();
      await fetchRooms();
    } catch (err) {
      console.error("Failed to send message:", err);
      if (replyTarget) setReplyingTo(replyTarget);
    } finally {
      setIsSending(false);
    }
  };

  const reactToClientMessage = async (msg: ChatMessage, emoji: string) => {
    if (msg.id.startsWith("temp_") || actionBusy) return;
    setActionBusy(msg.id);
    try {
      const response = await fetch(`/api/chat/messages/${msg.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Reaction failed");
      await fetchMessages();
    } finally {
      setActionBusy(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const uploadDocument = async (file: File) => {
    if (!selectedRoom) return;
    const check = validateChatUpload(file.size, file.type || "");
    if (!check.ok) return appAlert(check.error);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("roomId", selectedRoom);
      const uploadResponse = await fetch("/api/chat/upload", { method: "POST", body: formData });
      const upload = await uploadResponse.json();
      if (!uploadResponse.ok || !upload.ok) throw new Error(upload.error || "Upload failed");

      const sendResponse = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: selectedRoom,
          message: `📎 ${upload.fileName}`,
          fileUrl: upload.publicUrl,
        }),
      });
      const sent = await sendResponse.json();
      if (!sendResponse.ok) throw new Error(sent.error || "Document could not be sent");
      await Promise.all([fetchMessages(), fetchRooms()]);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startClientCall = async (kind: "voice" | "video") => {
    if (!selectedRoom || startingCall || !selectedRoom.startsWith("client_")) return;
    setStartingCall(kind);
    try {
      const clientName = selectedRoomData ? getClientName(selectedRoomData) : "Client";
      const meetingResponse = await fetch("/api/cmeet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${kind === "voice" ? "Voice" : "Video"} call - ${clientName}`,
          audio_only: kind === "voice",
        }),
      });
      const meetingPayload = await meetingResponse.json();
      if (!meetingResponse.ok || !meetingPayload.ok) throw new Error(meetingPayload.error || "Could not start the call");
      const link = `/meet/${meetingPayload.meeting.room_code}`;
      const messageResponse = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: selectedRoom,
          message: `${kind === "voice" ? "📞 Voice" : "🎥 Video"} call started - join: ${link}`,
        }),
      });
      const messagePayload = await messageResponse.json();
      if (!messageResponse.ok) throw new Error(messagePayload.error || "Call invitation could not be sent");
      setActiveMeeting({
        url: link,
        title: `${kind === "voice" ? "Voice" : "Video"} call with ${clientName}`,
      });
      await Promise.all([fetchMessages(), fetchRooms()]);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not start the call");
    } finally {
      setStartingCall(null);
    }
  };

  const runClientMessageAction = async (
    msg: ChatMessage,
    action: "pin" | "unpin" | "star" | "unstar" | "bookmark" | "unbookmark" | "translate",
  ) => {
    if (msg.id.startsWith("temp_")) return;
    setActionBusy(msg.id);
    try {
      const payload: Record<string, unknown> = { action };
      if (action === "translate") {
        const language = await appPrompt({ title: "Translate message", message: "Translate this message to which language?", defaultValue: "English" });
        if (!language?.trim()) return;
        payload.language = language.trim();
      }
      const res = await fetch(`/api/chat/messages/${msg.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Message action failed");
      await fetchMessages();
      await fetchRooms();
    } catch (err) {
      console.error(err);
    } finally {
      setActionBusy(null);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const formatRoomTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const getClientName = (room: ChatRoom) => {
    if (room.client?.full_name || room.client?.email) {
      return room.client.full_name || room.client.email;
    }
    if (room.whatsapp) {
      return room.whatsapp.display_name || room.whatsapp.wa_name || `+${room.whatsapp.phone}`;
    }
    if (room.meta) {
      return (
        room.meta.display_name ||
        (room.meta.username ? `@${room.meta.username}` : room.meta.external_user_id)
      );
    }
    // No linked profile yet - hide the raw uuid from the admin UI.
    return "Client";
  };

  const pinnedMessages = messages
    .filter((message) => Boolean(message.pinned_at) && !message.deleted_at)
    .sort((a, b) => new Date(b.pinned_at || b.created_at).getTime() - new Date(a.pinned_at || a.created_at).getTime());
  const activePinnedMessage = pinnedMessages[Math.min(pinnedIndex, Math.max(0, pinnedMessages.length - 1))] || null;

  const showPinnedMessage = (index: number) => {
    if (!pinnedMessages.length) return;
    const next = (index + pinnedMessages.length) % pinnedMessages.length;
    setPinnedIndex(next);
    const message = pinnedMessages[next];
    document.getElementById(`admin-client-message-${message.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const getInitials = (room: ChatRoom) => {
    const name = getClientName(room);
    if (!name || name === "Client") return "?";
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
  };

  const getClientAvatar = (room: ChatRoom) => room.client?.avatar_url || null;

  const getRoomSource = (room: ChatRoom): MessageSource => {
    if (room.source) return room.source;
    if (room.roomId.startsWith("whatsapp_")) return "whatsapp_qr";
    if (room.roomId.startsWith("facebook_")) return "facebook";
    if (room.roomId.startsWith("instagram_")) return "instagram";
    return "web";
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: ChatMessage[] }[] = [];
  messages.forEach((msg) => {
    const dateLabel = formatDate(msg.created_at);
    const lastGroup = groupedMessages[groupedMessages.length - 1];
    if (lastGroup && lastGroup.date === dateLabel) {
      lastGroup.messages.push(msg);
    } else {
      groupedMessages.push({ date: dateLabel, messages: [msg] });
    }
  });

  const selectedRoomData = rooms.find((r) => r.roomId === selectedRoom);
  const totalUnreadCount = rooms.reduce((total, room) => total + Math.max(0, room.unreadCount || 0), 0);

  return (
    <div data-chat-shell className="flex h-full overflow-hidden rounded-xl border border-[#2a3578]">
      {/* Sidebar - Room List */}
      <div
        className={`flex w-full shrink-0 flex-col border-e border-[#2a3578] bg-[#1a2255] md:w-80 lg:w-96 ${
          mobileShowThread ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Sidebar Header */}
        <div className="px-5 py-4 border-b border-[#2a3578] shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#5BA8FF]" />
            <h2 className="text-white font-semibold text-lg">Conversations</h2>
            {totalUnreadCount > 0 && (
              <span className="ms-auto grid h-6 min-w-6 place-items-center rounded-full bg-[#5BA8FF] px-1.5 text-[10px] font-bold leading-none text-white">
                {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
              </span>
            )}
            <button
              type="button"
              onClick={() => void openClientPicker()}
              className={`${totalUnreadCount > 0 ? "" : "ms-auto"} grid h-9 w-9 place-items-center rounded-xl bg-[#0A4FE8] text-white transition hover:bg-[#0B45C7]`}
              title="Start a chat with a client"
              aria-label="Start a chat with a client"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void openWelcomeEditor()}
            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[#344185] bg-[#222D6B] px-3 text-[11px] font-semibold text-[#B9D9FF] transition hover:border-[#5BA8FF] hover:text-white"
          >
            <PenLine className="h-3.5 w-3.5" />
            Edit welcome msg
          </button>
        </div>

        {/* Room List */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingRooms ? (
            <div className="p-5 text-center text-gray-400 text-sm">
              Loading conversations...
            </div>
          ) : rooms.length === 0 ? (
            <div className="p-5 text-center text-gray-400 text-sm">
              No conversations yet
            </div>
          ) : (
            rooms.map((room) => (
              <button
                key={room.roomId}
                onClick={() => handleSelectRoom(room.roomId)}
                className={`w-full border-b border-[#2a3578]/50 px-5 py-4 text-start transition-colors hover:bg-[#222d6b] ${
                  selectedRoom === room.roomId ? "bg-[#222d6b]" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Content */}
                  <div data-directional-copy className="min-w-0 flex-1 text-start">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium text-sm truncate flex items-center gap-1.5">
                        {getClientName(room)}
                      </span>
                      <span className="ms-2 shrink-0 text-xs text-gray-400">
                        {room.lastMessageAt
                          ? formatRoomTime(room.lastMessageAt)
                          : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <SourceBadge source={getRoomSource(room)} />
                      <ChatSidebarPreview
                        text={room.lastMessage}
                        fallback="No messages"
                        className="h-4 min-w-0 flex-1 pe-2 text-xs text-gray-400"
                      />
                      {room.unreadCount > 0 && (
                        <span className="w-5 h-5 bg-[#5BA8FF] text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                          {room.unreadCount > 9 ? "9+" : room.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Avatar is the trailing visual marker for the conversation. */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a3578] text-[11px] font-bold uppercase text-[#5BA8FF]">
                    {getClientAvatar(room) ? (
                      <img
                        src={getClientAvatar(room)!}
                        alt={`${getClientName(room)} profile photo`}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : room.client || room.whatsapp || room.meta ? (
                      <span>{getInitials(room)}</span>
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message Thread */}
      <div
        className={`relative flex-1 flex flex-col bg-[#0f1740] ${
          !mobileShowThread ? "hidden md:flex" : "flex"
        }`}
      >
        {selectedRoom ? (
          <>
            {/* Thread Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2a3578] shrink-0">
              <button
                onClick={() => setMobileShowThread(false)}
                className="md:hidden w-8 h-8 rounded-full hover:bg-[#2a3578] flex items-center justify-center text-gray-400"
              >
                <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
              </button>
              <div className="w-9 h-9 rounded-full bg-[#2a3578] flex items-center justify-center overflow-hidden text-[#5BA8FF] text-[11px] font-bold uppercase">
                {selectedRoomData && getClientAvatar(selectedRoomData) ? (
                  <img
                    src={getClientAvatar(selectedRoomData)!}
                    alt={`${getClientName(selectedRoomData)} profile photo`}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : selectedRoomData && (selectedRoomData.client || selectedRoomData.whatsapp || selectedRoomData.meta) ? (
                  <span>{getInitials(selectedRoomData)}</span>
                ) : (
                  <User className="w-5 h-5" />
                )}
              </div>
              <div data-directional-copy className="min-w-0 text-start">
                <p className="text-white font-medium text-sm flex items-center gap-2">
                  {selectedRoomData ? getClientName(selectedRoomData) : selectedRoom}
                  {selectedRoomData && <SourceBadge source={getRoomSource(selectedRoomData)} />}
                </p>
                <p className="text-gray-400 text-xs">
                  {selectedRoomData?.whatsapp
                    ? `WhatsApp · +${selectedRoomData.whatsapp.phone}`
                    : selectedRoomData?.meta
                      ? `${selectedRoomData.meta.platform === "facebook" ? "Messenger" : "Instagram"}${selectedRoomData.meta.username ? ` · @${selectedRoomData.meta.username}` : ""}`
                      : "Client"}
                </p>
              </div>
              {selectedRoom.startsWith("client_") && (
                <div className="ms-auto flex items-center gap-1">
                  <button
                    onClick={() => void startClientCall("voice")}
                    disabled={!!startingCall}
                    className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 transition hover:bg-[#2a3578] hover:text-[#5BA8FF] disabled:opacity-40"
                    title="Start audio call"
                  >
                    {startingCall === "voice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => void startClientCall("video")}
                    disabled={!!startingCall}
                    className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 transition hover:bg-[#2a3578] hover:text-[#5BA8FF] disabled:opacity-40"
                    title="Start video call"
                  >
                    {startingCall === "video" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </div>

            {activePinnedMessage && (
              <div className="flex shrink-0 items-center gap-2 border-b border-[#2a3578] bg-[#121c4b] px-4 py-2.5 text-start">
                <button type="button" onClick={() => showPinnedMessage(pinnedIndex)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-start transition hover:bg-white/5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#5BA8FF]/15 text-[#7dbbff]"><Pin className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block text-[10px] font-semibold text-[#7dbbff]">Pinned message #{pinnedIndex + 1} of {pinnedMessages.length}</span><span className="block truncate text-[12px] text-white/65">{activePinnedMessage.message || "Attachment"}</span></span>
                </button>
                {pinnedMessages.length > 1 && <div className="flex shrink-0 flex-col"><button type="button" onClick={() => showPinnedMessage(pinnedIndex - 1)} className="grid h-6 w-7 place-items-center rounded-md text-white/45 hover:bg-white/10 hover:text-white" aria-label="Previous pinned message"><ChevronUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => showPinnedMessage(pinnedIndex + 1)} className="grid h-6 w-7 place-items-center rounded-md text-white/45 hover:bg-white/10 hover:text-white" aria-label="Next pinned message"><ChevronDown className="h-3.5 w-3.5" /></button></div>}
              </div>
            )}

            {/* Messages Area */}
            <div ref={messagesScrollRef} onScroll={handleMessagesScroll} dir="ltr" className="flex-1 space-y-1 overflow-y-auto px-4 py-4 sm:px-5">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  No messages in this conversation
                </div>
              ) : (
                groupedMessages.map((group) => (
                  <div key={group.date}>
                    <div className="flex justify-center my-4">
                      <span className="text-xs text-gray-500 bg-[#1a2255] px-3 py-1 rounded-full">
                        {group.date}
                      </span>
                    </div>
                    {group.messages.map((msg) => {
                      const isOwn = msg.sender_role === "admin";
                      const starred = (msg.starred_by || []).some((key) => key.startsWith("admin:"));
                      const bookmarked = (msg.bookmarked_by || []).some((key) => key.startsWith("admin:"));
                      const translations = Object.entries(msg.translated || {});
                      const replyTarget = msg.reply_to_message_id
                        ? messages.find((candidate) => candidate.id === msg.reply_to_message_id) || null
                        : null;
                      const previewUrl = firstUrl(msg.message);
                      const reactionEntries = Object.entries(msg.reactions || {}).filter(([, users]) => users.length > 0);
                      return (
                        <div
                          key={msg.id}
                          className={`group flex mb-2 items-end gap-2 ${isOwn ? "justify-end" : "justify-start"}`}
                        >
                          {isOwn && (
                            <ClientMessageTools
                              msg={msg}
                              busy={actionBusy === msg.id}
                              starred={starred}
                              bookmarked={bookmarked}
                              onForward={() => setForwardMsg(msg)}
                              onAction={runClientMessageAction}
                            />
                          )}
                          <ContextMenu>
                            <ContextMenuTrigger asChild>
                          <div
                            id={`admin-client-message-${msg.id}`}
                            dir="auto"
                            className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-start text-sm sm:max-w-[75%] ${
                              isOwn
                                ? "bg-[#5BA8FF] text-white rounded-br-sm"
                                : "bg-[#1a2255] text-gray-200 rounded-bl-sm"
                            }`}
                          >
                            {replyTarget && (
                              <button type="button" onClick={() => document.getElementById(`admin-client-message-${replyTarget.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className={`mb-2 block w-full rounded-xl border-s-2 px-3 py-2 text-start ${isOwn ? "border-white/60 bg-white/10" : "border-[#5BA8FF] bg-[#0f1740]/50"}`}>
                                <span className="block text-[10px] font-semibold text-[#9fcaff]">{replyTarget.sender_role === "admin" ? "CDS Space" : "Client"}</span>
                                <span className="block max-w-sm truncate text-[11px] opacity-75">{replyTarget.message || "Attachment"}</span>
                              </button>
                            )}
                            {msg.forwarded && (
                              <div
                                className={`text-[11px] mb-1.5 pl-2.5 border-l-2 flex items-start gap-1 ${
                                  isOwn ? "border-white/50 text-white/85" : "border-[#5BA8FF]/50 text-gray-400"
                                }`}
                              >
                                <CornerDownRight className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>
                                  Forwarded · originally from{" "}
                                  <span className="font-semibold">{msg.forwarded.original_sender_name}</span>
                                </span>
                              </div>
                            )}
                            {(msg.pinned_at || starred || bookmarked) && (
                              <div className={`mb-1.5 flex flex-wrap gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                                {msg.pinned_at && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-semibold"><Pin className="w-3 h-3" /> Pinned</span>}
                                {starred && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-semibold"><Star className="w-3 h-3" /> Starred</span>}
                                {bookmarked && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-semibold"><Bookmark className="w-3 h-3" /> Saved</span>}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap break-words">
                              {msg.deleted_at ? "Message deleted" : (
                                <Linkified
                                  text={msg.message}
                                  onMeetingLink={(url) => setActiveMeeting({
                                    url,
                                    title: `${selectedRoomData ? getClientName(selectedRoomData) : "Client"} · cMeet call`,
                                  })}
                                />
                              )}
                            </p>
                            {previewUrl && <LinkPreview url={previewUrl} variant="dark" />}
                            {translations.length > 0 && (
                              <div className={`mt-2 rounded-xl border px-3 py-2 ${isOwn ? "border-white/20 bg-white/10" : "border-[#2a3578] bg-[#0f1740]/60"}`}>
                                {translations.map(([language, translated]) => (
                                  <div key={language}>
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#9fcaff]">{language}</p>
                                    <p className="text-[12px] leading-5">{translated}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {msg.file_url && (
                              isChatImageUrl(msg.file_url) ? (
                                <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-white/20 bg-white/10">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={msg.file_url} alt="Message visual" className="max-h-80 w-full object-contain" />
                                </a>
                              ) : (
                                <a
                                  href={msg.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`text-xs underline mt-1 block ${
                                    isOwn ? "text-blue-100" : "text-[#5BA8FF]"
                                  }`}
                                >
                                  Attachment
                                </a>
                              )
                            )}
                            <p
                              className={`text-[10px] mt-1 ${
                                isOwn ? "text-blue-100" : "text-gray-500"
                              }`}
                            >
                              {formatTime(msg.created_at)}
                            </p>
                            {reactionEntries.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {reactionEntries.map(([emoji, users]) => (
                                  <button key={emoji} type="button" onClick={() => void reactToClientMessage(msg, emoji)} className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px]">{emoji} {users.length}</button>
                                ))}
                              </div>
                            )}
                          </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-52">
                              <ContextMenuItem onClick={() => setReplyingTo(msg)}><Reply className="me-2 h-4 w-4" />Reply</ContextMenuItem>
                              <ContextMenuItem onClick={() => void reactToClientMessage(msg, "👍")}><SmilePlus className="me-2 h-4 w-4" />React 👍</ContextMenuItem>
                              <ContextMenuItem onClick={() => void reactToClientMessage(msg, "❤️")}><span className="me-2">❤️</span>React with love</ContextMenuItem>
                              <ContextMenuItem onClick={() => setForwardMsg(msg)}><Forward className="me-2 h-4 w-4" />Forward</ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem onClick={() => void runClientMessageAction(msg, bookmarked ? "unbookmark" : "bookmark")}><Bookmark className="me-2 h-4 w-4" />{bookmarked ? "Remove saved" : "Save message"}</ContextMenuItem>
                              <ContextMenuItem onClick={() => void runClientMessageAction(msg, starred ? "unstar" : "star")}><Star className="me-2 h-4 w-4" />{starred ? "Remove star" : "Star message"}</ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                          {!isOwn && (
                            <ClientMessageTools
                              msg={msg}
                              busy={actionBusy === msg.id}
                              starred={starred}
                              bookmarked={bookmarked}
                              onForward={() => setForwardMsg(msg)}
                              onAction={runClientMessageAction}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {!isAtLatest && (
              <button
                type="button"
                onClick={() => scrollToLatest("smooth")}
                className="absolute bottom-[82px] right-4 z-20 inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-[#5BA8FF] px-3 text-xs font-semibold text-white shadow-xl shadow-black/25 transition hover:bg-[#4a97ee]"
                aria-label="Go to the latest message"
                title="Go to the latest message"
              >
                <ChevronDown className="h-5 w-5" />
                {newMessageCount > 0 && <span>{newMessageCount > 99 ? "99+" : newMessageCount}</span>}
              </button>
            )}

            {/* Input Area */}
            <div className="px-5 py-4 border-t border-[#2a3578] shrink-0">
              {replyingTo && (
                <div className="mb-2 flex items-center gap-3 rounded-xl border border-[#2a3578] bg-[#1a2255] px-3 py-2 text-start text-white">
                  <Reply className="h-4 w-4 shrink-0 text-[#5BA8FF]" />
                  <div className="min-w-0 flex-1"><p className="text-[10px] font-bold text-[#9fcaff]">Replying to {replyingTo.sender_role === "admin" ? "CDS Space" : "client"}</p><p className="truncate text-[11px] text-white/55">{replyingTo.message || "Attachment"}</p></div>
                  <button type="button" onClick={() => setReplyingTo(null)} className="grid h-7 w-7 place-items-center rounded-lg text-white/50 hover:bg-white/10" aria-label="Cancel reply"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadDocument(file);
                  }}
                />
                {selectedRoom.startsWith("client_") && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || isSending}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#2a3578] text-gray-400 transition hover:border-[#5BA8FF] hover:text-[#5BA8FF] disabled:opacity-40"
                    title="Send a document"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </button>
                )}
                <input
                  dir="auto"
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1 rounded-full border border-[#2a3578] bg-[#1a2255] px-4 py-2.5 text-start text-sm text-white placeholder-gray-500 focus:border-[#5BA8FF] focus:outline-none focus:ring-1 focus:ring-[#5BA8FF]"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  className="w-10 h-10 rounded-full bg-[#5BA8FF] text-white flex items-center justify-center hover:bg-[#4a97ee] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <MessageSquare className="w-16 h-16 mb-4 text-[#2a3578]" />
            <p className="text-lg font-medium text-gray-400">
              Select a conversation
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Choose a chat from the sidebar to start messaging
            </p>
          </div>
        )}
      </div>

      {forwardMsg && (
        <ClientMsgForwardDialog
          message={forwardMsg}
          onClose={() => setForwardMsg(null)}
          onDone={() => setForwardMsg(null)}
        />
      )}
      {showClientPicker && (
        <ClientConversationPicker
          clients={platformClients}
          loading={clientPickerLoading}
          search={clientSearch}
          onSearch={setClientSearch}
          onChoose={beginClientConversation}
          onClose={() => { setShowClientPicker(false); setClientSearch(""); }}
        />
      )}
      {showWelcomeEditor && (
        <WelcomeMessageEditor
          message={welcomeMessage}
          active={welcomeActive}
          loading={welcomeLoading}
          saving={welcomeSaving}
          backfillBusy={welcomeBackfillBusy}
          updatedAt={welcomeUpdatedAt}
          onMessage={setWelcomeMessage}
          onActive={setWelcomeActive}
          onSave={() => void saveWelcomeMessage()}
          onBackfill={() => void sendWelcomeToExistingClients()}
          onClose={() => { if (!welcomeSaving && !welcomeBackfillBusy) setShowWelcomeEditor(false); }}
        />
      )}
      {activeMeeting && (
        <EmbeddedMeetingPanel
          url={activeMeeting.url}
          title={activeMeeting.title}
          onClose={() => setActiveMeeting(null)}
        />
      )}
    </div>
  );
}

function WelcomeMessageEditor({
  message,
  active,
  loading,
  saving,
  backfillBusy,
  updatedAt,
  onMessage,
  onActive,
  onSave,
  onBackfill,
  onClose,
}: {
  message: string;
  active: boolean;
  loading: boolean;
  saving: boolean;
  backfillBusy: boolean;
  updatedAt: string | null;
  onMessage: (value: string) => void;
  onActive: (value: boolean) => void;
  onSave: () => void;
  onBackfill: () => void;
  onClose: () => void;
}) {
  const valid = message.trim().length >= 50 && message.length <= 12_000;

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[#2A3578] bg-[#0F1740] text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[#2A3578] px-5 py-4 sm:px-6">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#0A4FE8]"><PenLine className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1 text-start">
            <h3 className="text-[16px] font-bold">Client welcome message</h3>
            <p className="mt-0.5 text-[11px] text-white/50">Sent once in Chat/Meet and email when a client account is created.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving || backfillBusy} className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40" aria-label="Close welcome message editor"><X className="h-4 w-4" /></button>
        </div>

        {loading ? (
          <div className="grid min-h-80 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#5BA8FF]" /></div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#2A3578] bg-[#1A2255] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-start">
                  <p className="text-[12px] font-semibold">Automatic signup delivery</p>
                  <p className="mt-1 text-[10px] leading-4 text-white/45">Turning this off pauses future welcome messages. It does not remove messages already delivered.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-white/75">
                  <input type="checkbox" checked={active} onChange={(event) => onActive(event.target.checked)} className="h-4 w-4 accent-[#0A4FE8]" />
                  {active ? "Enabled" : "Paused"}
                </label>
              </div>

              <label className="block text-start">
                <span className="text-[11px] font-semibold text-[#8FC3FF]">Message sent to new clients</span>
                <textarea
                  autoFocus
                  dir="auto"
                  value={message}
                  onChange={(event) => onMessage(event.target.value)}
                  className="mt-3 min-h-[48dvh] w-full resize-y rounded-2xl border border-[#2A3578] bg-[#111B4B] p-4 text-start text-[13px] leading-6 text-white outline-none placeholder:text-white/25 focus:border-[#5BA8FF] focus:ring-2 focus:ring-[#5BA8FF]/20"
                  placeholder="Write the welcome message new clients should receive…"
                  maxLength={12_000}
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/40">
                <span>Use **bold text** and [link text](https://example.com) when needed.</span>
                <span className={message.length > 12_000 || message.trim().length < 50 ? "text-amber-300" : ""}>{message.length.toLocaleString()} / 12,000</span>
              </div>
              <div className="mt-5 rounded-2xl border border-[#2A3578] bg-[#1A2255] p-4 text-start">
                <p className="text-[12px] font-semibold">Existing clients</p>
                <p className="mt-1 text-[10px] leading-4 text-white/45">Send the current template to older accounts that have not received it before. Chat and email delivery are tracked separately to prevent duplicates.</p>
                <button type="button" onClick={onBackfill} disabled={saving || backfillBusy} className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#4B67D8] px-4 text-[11px] font-bold text-white transition hover:bg-white/5 disabled:opacity-40">
                  {backfillBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {backfillBusy ? "Sending…" : "Send to existing clients"}
                </button>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[#2A3578] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-[10px] text-white/35">{updatedAt ? `Last updated ${new Date(updatedAt).toLocaleString()}` : "Default CDS Space welcome message"}</p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} disabled={saving || backfillBusy} className="h-10 rounded-xl border border-[#2A3578] px-4 text-[11px] font-semibold text-white/70 transition hover:bg-white/5 disabled:opacity-40">Cancel</button>
                <button type="button" onClick={onSave} disabled={!valid || saving || backfillBusy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[11px] font-bold text-white transition hover:bg-[#0B45C7] disabled:cursor-not-allowed disabled:opacity-40">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? "Saving…" : "Save welcome msg"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ClientConversationPicker({
  clients,
  loading,
  search,
  onSearch,
  onChoose,
  onClose,
}: {
  clients: PlatformClientLite[];
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  onChoose: (client: PlatformClientLite) => void;
  onClose: () => void;
}) {
  const query = search.trim().toLowerCase();
  const filtered = clients.filter((client) => !query || [client.name, client.brand_name, client.email]
    .some((value) => value?.toLowerCase().includes(query)));

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#2a3578] bg-[#0F1740] text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[#2a3578] px-5 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#0A4FE8]"><MessageSquarePlus className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold">Start Chat/Meet</h3>
            <p className="text-[11px] text-white/50">Choose any client with a CDS Space account.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b border-[#2a3578] p-4">
          <label className="relative block">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              autoFocus
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search by client name or email"
              className="h-11 w-full rounded-2xl border border-[#2a3578] bg-[#1A2255] ps-10 pe-4 text-start text-[13px] text-white outline-none placeholder:text-white/35 focus:border-[#5BA8FF]"
            />
          </label>
        </div>
        <div className="min-h-48 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex h-44 items-center justify-center text-white/45"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex h-44 flex-col items-center justify-center text-center text-white/45"><Search className="mb-3 h-7 w-7" /><p className="text-[13px]">No platform client matches your search.</p></div>
          ) : filtered.map((client) => (
            <button
              key={client.platform_user_id}
              type="button"
              onClick={() => onChoose(client)}
              className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-start transition hover:border-[#2a3578] hover:bg-[#1A2255]"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#233071] text-[11px] font-bold uppercase text-[#75B5FF]">
                {client.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">{client.name}</p>
                <p className="truncate text-[11px] text-white/45">{client.email || client.brand_name || "CDS Space client"}</p>
              </div>
              <MessageSquare className="h-4 w-4 text-[#5BA8FF]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClientMessageTools({
  msg,
  busy,
  starred,
  bookmarked,
  onForward,
  onAction,
}: {
  msg: ChatMessage;
  busy: boolean;
  starred: boolean;
  bookmarked: boolean;
  onForward: () => void;
  onAction: (
    msg: ChatMessage,
    action: "pin" | "unpin" | "star" | "unstar" | "bookmark" | "unbookmark" | "translate",
  ) => void;
}) {
  return (
    <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition flex items-center gap-1">
      <button
        onClick={() => onAction(msg, msg.pinned_at ? "unpin" : "pin")}
        disabled={busy}
        className="p-1.5 rounded-full hover:bg-[#2a3578] text-gray-400 hover:text-[#5BA8FF] disabled:opacity-40"
        title={msg.pinned_at ? "Unpin" : "Pin"}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pin className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={() => onAction(msg, starred ? "unstar" : "star")}
        disabled={busy}
        className="p-1.5 rounded-full hover:bg-[#2a3578] text-gray-400 hover:text-[#5BA8FF] disabled:opacity-40"
        title={starred ? "Unstar" : "Star"}
      >
        <Star className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onAction(msg, bookmarked ? "unbookmark" : "bookmark")}
        disabled={busy}
        className="p-1.5 rounded-full hover:bg-[#2a3578] text-gray-400 hover:text-[#5BA8FF] disabled:opacity-40"
        title={bookmarked ? "Remove bookmark" : "Bookmark"}
      >
        <Bookmark className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onAction(msg, "translate")}
        disabled={busy || !msg.message}
        className="p-1.5 rounded-full hover:bg-[#2a3578] text-gray-400 hover:text-[#5BA8FF] disabled:opacity-40"
        title="Translate"
      >
        <Languages className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onForward}
        disabled={busy}
        className="p-1.5 rounded-full hover:bg-[#2a3578] text-gray-400 hover:text-[#5BA8FF] disabled:opacity-40"
        title="Forward"
      >
        <Forward className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ClientMsgForwardDialog({
  message,
  onClose,
  onDone,
}: {
  message: ChatMessage;
  onClose: () => void;
  onDone: () => void;
}) {
  const [threads, setThreads] = useState<TeamThreadLite[]>([]);
  const [clients, setClients] = useState<PlatformClientLite[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [threadResponse, clientResponse] = await Promise.all([
        fetch("/api/team/chat/threads", { cache: "no-store" }),
        fetch("/api/admin/clients/directory", { cache: "no-store" }),
      ]);
      const [threadPayload, clientPayload] = await Promise.all([threadResponse.json(), clientResponse.json()]);
      if (threadResponse.ok && threadPayload.ok) setThreads(threadPayload.threads || []);
      if (clientResponse.ok) {
        const unique = new Map<string, PlatformClientLite>();
        for (const client of clientPayload.clients || []) {
          if (!client.has_platform_account || !client.platform_user_id) continue;
          unique.set(client.platform_user_id, {
            platform_user_id: client.platform_user_id,
            name: client.name || client.brand_name || client.email || "Client",
            brand_name: client.brand_name || null,
            email: client.email || null,
          });
        }
        setClients(Array.from(unique.values()));
      }
    })();
  }, []);

  async function forward(target: "team" | "client", targetId: string) {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/chat/forward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "client",
        source_id: message.id,
        target,
        target_id: target === "client" ? `client_${targetId}` : targetId,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok || !j.ok) {
      setError(j.error || "Couldn't forward");
      return;
    }
    onDone();
  }

  const filtered = threads.filter((t) => (t.name || "").toLowerCase().includes(search.toLowerCase()));
  const filteredClients = clients.filter((client) => [client.name, client.email, client.brand_name]
    .some((value) => value?.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-[#0D1B39]">Forward message</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Send to another client or an internal team chat.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="px-5 pt-3 pb-2 bg-gray-50 border-b border-gray-100 text-[12px] text-gray-600 italic line-clamp-2">
          “{message.message || message.file_url || ""}”
        </div>
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients or team chats…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
        {error && (
          <div className="mx-5 mb-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11.5px] px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {filtered.length === 0 && filteredClients.length === 0 ? (
            <p className="text-center text-[12px] text-gray-400 py-8">No destination matches your search.</p>
          ) : (
            <div className="space-y-4">
            {filteredClients.length > 0 && <div><p className="px-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-gray-400">Clients</p><ul className="space-y-0.5">
              {filteredClients.map((client) => (
                <li key={client.platform_user_id}>
                  <button onClick={() => forward("client", client.platform_user_id)} disabled={busy} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-2.5 disabled:opacity-50">
                    <div className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-[10px] font-bold text-[#0A4FE8]">{client.name.charAt(0).toUpperCase()}</div>
                    <div className="min-w-0 flex-1"><p className="truncate text-[13px] text-[#0D1B39]">{client.name}</p><p className="truncate text-[10px] text-gray-400">{client.email || "CDS Space client"}</p></div>
                  </button>
                </li>
              ))}
            </ul></div>}
            {filtered.length > 0 && <div><p className="px-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-gray-400">Team chats</p><ul className="space-y-0.5">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => forward("team", t.id)}
                    disabled={busy}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-2.5 disabled:opacity-50"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center text-[11px] font-bold">
                      {(t.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[13px] text-[#0D1B39] truncate flex-1">{t.name || "Untitled"}</span>
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />}
                  </button>
                </li>
              ))}
            </ul></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
