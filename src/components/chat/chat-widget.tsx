"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const roomId = userId ? `client_${userId}` : null;

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();
  }, []);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await fetch(
        `/api/chat/messages?roomId=${roomId}&limit=50`
      );
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);

      // Count unread messages from admin
      const unread = (data.messages || []).filter(
        (m: ChatMessage) => m.sender_role === "admin" && !m.is_read
      ).length;
      setUnreadCount(unread);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  }, [roomId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Scroll to bottom when messages change or panel opens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Mark messages as read when panel is open
  useEffect(() => {
    if (isOpen && roomId && unreadCount > 0) {
      fetch("/api/chat/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      }).then(() => {
        setUnreadCount(0);
      });
    }
  }, [isOpen, roomId, unreadCount]);

  const handleSend = async () => {
    if (!input.trim() || !roomId || !userId || isSending) return;

    const text = input.trim();
    setInput("");
    setIsSending(true);

    // Optimistic update
    const optimisticMsg: ChatMessage = {
      id: `temp_${Date.now()}`,
      room_id: roomId,
      sender_id: userId,
      sender_role: "client",
      message: text,
      created_at: new Date().toISOString(),
      is_read: false,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, message: text }),
      });
      // Refetch to get the real message with server ID
      await fetchMessages();
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

  if (!userId) return null;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[52px] h-[52px] sm:w-14 sm:h-14 rounded-full bg-[#08129C] text-white shadow-lg hover:bg-[#0a18c0] transition-colors flex items-center justify-center"
      >
        <MessageSquare className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-3 right-3 bottom-20 sm:left-auto sm:right-6 sm:bottom-24 z-50 w-auto sm:w-[400px] max-w-[calc(100vw-24px)] h-[min(32rem,calc(100dvh-6rem))] sm:h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-[#08129C] text-white shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                <h3 className="font-semibold text-base">Chat with CDS Team</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-gray-50">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  No messages yet. Start the conversation!
                </div>
              )}
              {groupedMessages.map((group) => (
                <div key={group.date}>
                  <div className="flex justify-center my-3">
                    <span className="text-xs text-gray-400 bg-gray-200 px-3 py-1 rounded-full">
                      {group.date}
                    </span>
                  </div>
                  {group.messages.map((msg) => {
                    const isOwn = msg.sender_role === "client";
                    return (
                      <div
                        key={msg.id}
                        className={`flex mb-2 ${isOwn ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                            isOwn
                              ? "bg-[#08129C] text-white rounded-br-sm"
                              : "bg-gray-200 text-gray-900 rounded-bl-sm"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                          {msg.file_url && (
                            <a
                              href={msg.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-xs underline mt-1 block ${
                                isOwn ? "text-blue-200" : "text-blue-600"
                              }`}
                            >
                              Attachment
                            </a>
                          )}
                          <p
                            className={`text-[10px] mt-1 ${
                              isOwn ? "text-blue-200" : "text-gray-400"
                            }`}
                          >
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 bg-white border-t border-gray-200 shrink-0">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 rounded-full border border-gray-300 text-sm text-gray-900 focus:outline-none focus:border-[#08129C] focus:ring-1 focus:ring-[#08129C]"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  className="w-10 h-10 rounded-full bg-[#08129C] text-white flex items-center justify-center hover:bg-[#0a18c0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
