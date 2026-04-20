"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Send, MessageSquare, SmilePlus, Sparkles, Sun } from "lucide-react";
import CosmicStarfield from "@/components/shared/CosmicStarfield";

interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  sender_role: "admin" | "client";
  message: string;
  file_url?: string;
  created_at: string;
  is_read: boolean;
  reactions?: Record<string, string[]>;
}

const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "😡", "👏", "🙏", "🔥"];
const BG_KEY = "cds_chat_bg";

export default function ClientMessagesPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [bg, setBg] = useState<"cosmic" | "white">("cosmic");
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const roomId = userId ? `client_${userId}` : null;

  // Load saved background pref
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(BG_KEY);
      if (saved === "white" || saved === "cosmic") setBg(saved);
    }
  }, []);

  const switchBg = (next: "cosmic" | "white") => {
    setBg(next);
    if (typeof window !== "undefined") localStorage.setItem(BG_KEY, next);
  };

  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/chat/messages?roomId=${roomId}&limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {}
  }, [roomId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Mark as read
  useEffect(() => {
    if (!roomId) return;
    const unread = messages.filter((m) => m.sender_role === "admin" && !m.is_read).length;
    if (unread > 0) {
      fetch("/api/chat/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
    }
  }, [roomId, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close reaction picker on outside click
  useEffect(() => {
    if (!reactionPickerFor) return;
    const close = () => setReactionPickerFor(null);
    const t = setTimeout(() => document.addEventListener("click", close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", close);
    };
  }, [reactionPickerFor]);

  const handleSend = async () => {
    if (!input.trim() || !roomId || !userId || isSending) return;
    const text = input.trim();
    setInput("");
    setIsSending(true);

    const optimistic: ChatMessage = {
      id: `temp_${Date.now()}`,
      room_id: roomId,
      sender_id: userId,
      sender_role: "client",
      message: text,
      created_at: new Date().toISOString(),
      is_read: false,
      reactions: {},
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, message: text }),
      });
      await fetchMessages();
    } catch {}
    setIsSending(false);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (messageId.startsWith("temp_") || !userId) return;
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const r = { ...(m.reactions ?? {}) };
        const list = new Set(r[emoji] ?? []);
        if (list.has(userId)) list.delete(userId);
        else list.add(userId);
        if (list.size === 0) delete r[emoji];
        else r[emoji] = Array.from(list);
        return { ...m, reactions: r };
      })
    );
    setReactionPickerFor(null);
    try {
      await fetch(`/api/chat/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch {}
  };

  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const formatDate = (d: string) => {
    const date = new Date(d);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Group by date
  const grouped: { date: string; messages: ChatMessage[] }[] = [];
  messages.forEach((m) => {
    const date = formatDate(m.created_at);
    const last = grouped[grouped.length - 1];
    if (last?.date === date) last.messages.push(m);
    else grouped.push({ date, messages: [m] });
  });

  const isCosmic = bg === "cosmic";

  return (
    <div className="flex flex-col h-[calc(100vh-104px)] relative overflow-hidden rounded-2xl">
      {/* Background */}
      {isCosmic ? (
        <div className="absolute inset-0 bg-[#040B37] -z-10">
          <CosmicStarfield starCount={140} />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-blue-50 -z-10" />
      )}

      {/* Header */}
      <div className={`px-6 py-4 border-b flex items-center justify-between gap-3 shrink-0 backdrop-blur-xl ${isCosmic ? "border-white/10 bg-[#040B37]/40" : "border-white/60 bg-white/60"}`}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center shadow-lg shadow-blue-600/20">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`text-lg font-semibold ${isCosmic ? "text-white" : "text-brand-navy"}`}>Messages</h1>
            <p className={`text-xs ${isCosmic ? "text-white/60" : "text-brand-body/60"}`}>Chat with the CDS Space team</p>
          </div>
        </div>

        {/* Background switcher */}
        <div className={`flex items-center gap-1 rounded-full p-1 ${isCosmic ? "bg-white/10" : "bg-gray-100"}`}>
          <button
            onClick={() => switchBg("cosmic")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition ${
              isCosmic ? "bg-white/20 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
            title="Cosmic background"
          >
            <Sparkles className="w-3.5 h-3.5" /> Cosmic
          </button>
          <button
            onClick={() => switchBg("white")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition ${
              !isCosmic ? "bg-white text-blue-700 shadow-sm" : "text-white/70 hover:text-white"
            }`}
            title="Light background"
          >
            <Sun className="w-3.5 h-3.5" /> Light
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 relative z-10">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className={`w-16 h-16 rounded-2xl grid place-items-center mb-4 ${isCosmic ? "bg-white/10" : "bg-blue-50"}`}>
              <MessageSquare className={`w-8 h-8 ${isCosmic ? "text-blue-300" : "text-blue-600"}`} />
            </div>
            <h3 className={`font-semibold mb-1 ${isCosmic ? "text-white" : "text-brand-navy"}`}>No messages yet</h3>
            <p className={`text-sm max-w-xs ${isCosmic ? "text-white/60" : "text-brand-body/60"}`}>
              Send a message to start a conversation with the CDS Space team.
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.date}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex-1 h-px ${isCosmic ? "bg-white/10" : "bg-gray-200"}`} />
                <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${isCosmic ? "text-white/70 bg-white/10" : "text-gray-500 bg-white/70"}`}>
                  {group.date}
                </span>
                <div className={`flex-1 h-px ${isCosmic ? "bg-white/10" : "bg-gray-200"}`} />
              </div>
              <div className="space-y-4">
                {group.messages.map((m) => {
                  const isMe = m.sender_role === "client";
                  const reactions = m.reactions ?? {};
                  const reactionEntries = Object.entries(reactions).filter(([, ids]) => ids.length > 0);
                  return (
                    <div key={m.id} className={`flex items-end gap-2 group ${isMe ? "justify-end" : "justify-start"}`}>
                      {!isMe && (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center text-white text-[11px] font-bold flex-shrink-0 shadow-lg shadow-blue-600/20">
                          C
                        </div>
                      )}

                      <div className={`max-w-[72%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                        <div className="relative">
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-lg ${
                              isMe
                                ? "bg-gradient-to-b from-blue-600 to-blue-700 text-white rounded-br-md shadow-blue-600/30"
                                : isCosmic
                                ? "bg-white/95 backdrop-blur-xl text-gray-900 rounded-bl-md shadow-blue-900/20"
                                : "bg-white border border-gray-100 text-gray-900 rounded-bl-md shadow-blue-900/5"
                            }`}
                          >
                            {!isMe && (
                              <p className="text-[10px] font-semibold text-blue-600 mb-1">CDS Space</p>
                            )}
                            <p className="whitespace-pre-wrap break-words">{m.message}</p>
                            <p
                              className={`text-[10px] mt-1.5 tabular-nums ${
                                isMe ? "text-white/70" : "text-gray-400"
                              }`}
                            >
                              {formatTime(m.created_at)}
                            </p>
                          </div>

                          {/* Add-reaction button (appears on hover) */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReactionPickerFor(reactionPickerFor === m.id ? null : m.id);
                            }}
                            className={`absolute ${isMe ? "-left-9" : "-right-9"} top-1/2 -translate-y-1/2 w-8 h-8 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition shadow-lg ${
                              isCosmic ? "bg-white/90 hover:bg-white text-gray-700" : "bg-white hover:bg-blue-50 text-gray-500 border border-gray-100"
                            }`}
                            title="Add reaction"
                          >
                            <SmilePlus className="w-4 h-4" />
                          </button>

                          {/* Reaction picker */}
                          {reactionPickerFor === m.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute z-30 -top-12 ${isMe ? "right-0" : "left-0"} bg-white rounded-full shadow-2xl border border-gray-100 px-2 py-1.5 flex items-center gap-0.5`}
                            >
                              {REACTION_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(m.id, emoji)}
                                  className="w-8 h-8 grid place-items-center text-lg hover:bg-gray-100 rounded-full transition hover:scale-125"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Reaction badges */}
                        {reactionEntries.length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-1.5 ${isMe ? "justify-end" : "justify-start"}`}>
                            {reactionEntries.map(([emoji, ids]) => {
                              const mine = userId ? ids.includes(userId) : false;
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(m.id, emoji)}
                                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition ${
                                    mine
                                      ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                                      : isCosmic
                                      ? "bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-md"
                                      : "bg-white text-gray-700 ring-1 ring-gray-200"
                                  }`}
                                >
                                  <span className="text-sm leading-none">{emoji}</span>
                                  <span className="tabular-nums">{ids.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {isMe && (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 grid place-items-center text-gray-700 text-[11px] font-bold flex-shrink-0">
                          Y
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={`px-6 py-4 border-t shrink-0 backdrop-blur-xl ${isCosmic ? "border-white/10 bg-[#040B37]/40" : "border-white/60 bg-white/60"}`}>
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            className={`flex-1 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition ${
              isCosmic
                ? "bg-white/10 border border-white/20 text-white placeholder:text-white/40"
                : "bg-white/90 border border-gray-200 text-gray-900 placeholder:text-gray-400"
            }`}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="w-12 h-12 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 text-white grid place-items-center shadow-lg shadow-blue-600/30 hover:from-blue-600 hover:to-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
