"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Send, User, ChevronLeft, Forward, X, Search, Loader2, CornerDownRight } from "lucide-react";

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
  source?: MessageSource;
  forwarded?: {
    original_sender_name: string;
    original_body: string;
    original_source: "client" | "team";
  } | null;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/rooms");
      if (!res.ok) return;
      const data = await res.json();
      setRooms(data.rooms || []);
    } catch (err) {
      console.error("Failed to fetch rooms:", err);
    } finally {
      setIsLoadingRooms(false);
    }
  }, []);

  // Fetch messages for selected room
  const fetchMessages = useCallback(async () => {
    if (!selectedRoom) return;
    try {
      const res = await fetch(
        `/api/chat/messages?roomId=${selectedRoom}&limit=50`
      );
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [selectedRoom]);

  // Initial rooms fetch + polling
  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  // Fetch messages when room changes + polling
  useEffect(() => {
    if (selectedRoom) {
      setIsLoadingMessages(true);
      fetchMessages();
    }
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [selectedRoom, fetchMessages]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
    setMobileShowThread(true);
    setTimeout(() => inputRef.current?.focus(), 200);
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedRoom || isSending) return;

    const text = input.trim();
    setInput("");
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
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: selectedRoom, message: text }),
      });
      await fetchMessages();
      await fetchRooms();
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
    // No linked profile yet — hide the raw uuid from the admin UI.
    return "Client";
  };

  const getAvatarUrl = (room: ChatRoom) => room.client?.avatar_url || null;

  const getInitials = (room: ChatRoom) => {
    const name = getClientName(room);
    if (!name || name === "Client") return "?";
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
  };

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

  return (
    <div className="flex h-full rounded-xl overflow-hidden border border-[#2a3578]">
      {/* Sidebar - Room List */}
      <div
        className={`w-full md:w-80 lg:w-96 bg-[#1a2255] border-r border-[#2a3578] flex flex-col shrink-0 ${
          mobileShowThread ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Sidebar Header */}
        <div className="px-5 py-4 border-b border-[#2a3578] shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#5BA8FF]" />
            <h2 className="text-white font-semibold text-lg">Conversations</h2>
          </div>
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
                className={`w-full text-left px-5 py-4 border-b border-[#2a3578]/50 hover:bg-[#222d6b] transition-colors ${
                  selectedRoom === room.roomId ? "bg-[#222d6b]" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-[#2a3578] flex items-center justify-center shrink-0 overflow-hidden text-[#5BA8FF] text-[11px] font-bold uppercase">
                    {getAvatarUrl(room) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getAvatarUrl(room) as string}
                        alt={getClientName(room)}
                        className="w-full h-full object-cover"
                      />
                    ) : room.client || room.whatsapp || room.meta ? (
                      <span>{getInitials(room)}</span>
                    ) : (
                      <User className="w-5 h-5" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium text-sm truncate flex items-center gap-1.5">
                        {getClientName(room)}
                      </span>
                      <span className="text-gray-400 text-xs shrink-0 ml-2">
                        {room.lastMessageAt
                          ? formatRoomTime(room.lastMessageAt)
                          : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <SourceBadge source={getRoomSource(room)} />
                      <p className="text-gray-400 text-xs truncate pr-2 flex-1">
                        {room.lastMessage || "No messages"}
                      </p>
                      {room.unreadCount > 0 && (
                        <span className="w-5 h-5 bg-[#5BA8FF] text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                          {room.unreadCount > 9 ? "9+" : room.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message Thread */}
      <div
        className={`flex-1 flex flex-col bg-[#0f1740] ${
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
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="w-9 h-9 rounded-full bg-[#2a3578] flex items-center justify-center overflow-hidden text-[#5BA8FF] text-[11px] font-bold uppercase">
                {selectedRoomData && getAvatarUrl(selectedRoomData) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getAvatarUrl(selectedRoomData) as string}
                    alt={getClientName(selectedRoomData)}
                    className="w-full h-full object-cover"
                  />
                ) : selectedRoomData && (selectedRoomData.client || selectedRoomData.whatsapp || selectedRoomData.meta) ? (
                  <span>{getInitials(selectedRoomData)}</span>
                ) : (
                  <User className="w-5 h-5" />
                )}
              </div>
              <div>
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
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
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
                      return (
                        <div
                          key={msg.id}
                          className={`group flex mb-2 items-end gap-2 ${isOwn ? "justify-end" : "justify-start"}`}
                        >
                          {isOwn && (
                            <button
                              onClick={() => setForwardMsg(msg)}
                              className="opacity-0 group-hover:opacity-100 transition p-1.5 rounded-full hover:bg-[#2a3578] text-gray-400 hover:text-[#5BA8FF]"
                              title="Forward"
                            >
                              <Forward className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <div
                            className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                              isOwn
                                ? "bg-[#5BA8FF] text-white rounded-br-sm"
                                : "bg-[#1a2255] text-gray-200 rounded-bl-sm"
                            }`}
                          >
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
                            <p className="whitespace-pre-wrap break-words">
                              {msg.message}
                            </p>
                            {msg.file_url && (
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
                            )}
                            <p
                              className={`text-[10px] mt-1 ${
                                isOwn ? "text-blue-100" : "text-gray-500"
                              }`}
                            >
                              {formatTime(msg.created_at)}
                            </p>
                          </div>
                          {!isOwn && (
                            <button
                              onClick={() => setForwardMsg(msg)}
                              className="opacity-0 group-hover:opacity-100 transition p-1.5 rounded-full hover:bg-[#2a3578] text-gray-400 hover:text-[#5BA8FF]"
                              title="Forward to team"
                            >
                              <Forward className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="px-5 py-4 border-t border-[#2a3578] shrink-0">
              <div className="flex items-center gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 rounded-full bg-[#1a2255] border border-[#2a3578] text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#5BA8FF] focus:ring-1 focus:ring-[#5BA8FF]"
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
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/team/chat/threads", { cache: "no-store" });
      const j = await r.json();
      if (r.ok && j.ok) setThreads(j.threads || []);
    })();
  }, []);

  async function forward(threadId: string) {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/chat/forward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "client",
        source_id: message.id,
        target: "team",
        target_id: threadId,
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-[#0D1B39]">Forward to team chat</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Only the original sender will show on the other side.</p>
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
              placeholder="Search threads…"
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
          {filtered.length === 0 ? (
            <p className="text-center text-[12px] text-gray-400 py-8">No threads yet. Create a department first.</p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => forward(t.id)}
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
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
