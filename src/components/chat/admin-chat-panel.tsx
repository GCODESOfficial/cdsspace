"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Send, User, ChevronLeft } from "lucide-react";

interface ChatRoom {
  roomId: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  client?: {
    id: string;
    email: string;
    full_name: string | null;
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
    return room.client?.full_name || room.client?.email || room.roomId;
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
                  <div className="w-10 h-10 rounded-full bg-[#2a3578] flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-[#5BA8FF]" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium text-sm truncate">
                        {getClientName(room)}
                      </span>
                      <span className="text-gray-400 text-xs shrink-0 ml-2">
                        {room.lastMessageAt
                          ? formatRoomTime(room.lastMessageAt)
                          : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-gray-400 text-xs truncate pr-2">
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
              <div className="w-9 h-9 rounded-full bg-[#2a3578] flex items-center justify-center">
                <User className="w-5 h-5 text-[#5BA8FF]" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">
                  {selectedRoomData ? getClientName(selectedRoomData) : selectedRoom}
                </p>
                <p className="text-gray-400 text-xs">Client</p>
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
                          className={`flex mb-2 ${isOwn ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                              isOwn
                                ? "bg-[#5BA8FF] text-white rounded-br-sm"
                                : "bg-[#1a2255] text-gray-200 rounded-bl-sm"
                            }`}
                          >
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
    </div>
  );
}
