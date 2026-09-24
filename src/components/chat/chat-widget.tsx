"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { appAlert, appPrompt } from "@/lib/app-notify";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, ChevronDown, Languages, Loader2, MessageSquare, Pin, Send, Star, X } from "lucide-react";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";
import { PlatformMediaViewer } from "@/components/media/PlatformMediaViewer";

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
  deleted_at?: string | null;
}

function isImageUrl(url: string | undefined) {
  if (!url) return false;
  try {
    return /\.(png|jpe?g|webp|gif)$/i.test(new URL(url, window.location.origin).pathname);
  } catch {
    return false;
  }
}

export function ChatWidget() {
  const { account } = useClientAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const userId = account.userId;
  const [isSending, setIsSending] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAtLatest, setIsAtLatest] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const isAtLatestRef = useRef(true);
  const initialScrollPending = useRef(true);
  const renderedLastMessageId = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const roomId = `client_${userId}`;

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
    const interval = setInterval(fetchMessages, 4_000);
    window.addEventListener("cds:notification-pulse", fetchMessages);
    return () => {
      clearInterval(interval);
      window.removeEventListener("cds:notification-pulse", fetchMessages);
    };
  }, [fetchMessages]);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    isAtLatestRef.current = true;
    setIsAtLatest(true);
    setNewMessageCount(0);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    isAtLatestRef.current = nearBottom;
    setIsAtLatest(nearBottom);
    if (nearBottom) setNewMessageCount(0);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
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
    if (isAtLatestRef.current || last.sender_role === "client") requestAnimationFrame(() => scrollToLatest(last.sender_role === "client" ? "smooth" : "auto"));
    else setNewMessageCount((count) => count + 1);
  }, [messages, isOpen, scrollToLatest]);

  useEffect(() => {
    if (!isOpen) initialScrollPending.current = true;
  }, [isOpen]);

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
        body: JSON.stringify({ roomId, actor: "client" }),
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
    requestAnimationFrame(() => scrollToLatest("smooth"));

    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, message: text, actor: "client" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Message could not be sent");
      // Refetch to get the real message with server ID
      await fetchMessages();
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessages((current) => current.filter((message) => message.id !== optimisticMsg.id));
      setInput(text);
      await appAlert(err instanceof Error ? err.message : "Message could not be sent");
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

  const runMessageAction = async (
    msg: ChatMessage,
    action: "pin" | "unpin" | "star" | "unstar" | "bookmark" | "unbookmark" | "translate",
  ) => {
    if (msg.id.startsWith("temp_")) return;
    setActionBusy(msg.id);
    try {
      const payload: Record<string, unknown> = { action, actor: "client" };
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

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[52px] h-[52px] sm:w-14 sm:h-14 rounded-full bg-[#08129C] text-white shadow-lg hover:bg-[#0a18c0] transition-colors flex items-center justify-center"
        aria-label={isOpen ? "Close Chat/Meet" : "Open Chat/Meet"}
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
                aria-label="Close Chat/Meet"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-gray-50">
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
                    const viewerKey = `client:${userId}`;
                    const starred = (msg.starred_by || []).includes(viewerKey);
                    const bookmarked = (msg.bookmarked_by || []).includes(viewerKey);
                    const translations = Object.entries(msg.translated || {});
                    return (
                      <div key={msg.id} className={`group flex mb-2 ${isOwn ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                            isOwn
                              ? "bg-[#08129C] text-white rounded-br-sm"
                              : "bg-gray-200 text-gray-900 rounded-bl-sm"
                          }`}
                        >
                          {(msg.pinned_at || starred || bookmarked) && (
                            <div className={`mb-1.5 flex flex-wrap gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                              {msg.pinned_at && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold"><Pin className="w-3 h-3" /> Pin</span>}
                              {starred && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold"><Star className="w-3 h-3" /> Star</span>}
                              {bookmarked && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-bold"><Bookmark className="w-3 h-3" /> Saved</span>}
                            </div>
                          )}
                          <p className="whitespace-pre-wrap break-words">{msg.deleted_at ? "Message deleted" : msg.message}</p>
                          {translations.length > 0 && (
                            <div className={`mt-2 rounded-xl border px-3 py-2 ${isOwn ? "border-white/20 bg-white/10" : "border-gray-300 bg-white/70"}`}>
                              {translations.map(([language, translated]) => (
                                <div key={language}>
                                  <p className={`text-[9px] font-bold uppercase tracking-widest ${isOwn ? "text-blue-100" : "text-[#08129C]"}`}>{language}</p>
                                  <p className="text-[12px] leading-5">{translated}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {msg.file_url && (
                            isImageUrl(msg.file_url) ? (
                              <PlatformMediaViewer url={msg.file_url} title="Chat image" triggerClassName="mt-2 block w-full overflow-hidden rounded-xl border border-white/20 bg-white/10">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={msg.file_url} alt="Chat image" className="max-h-64 w-full object-contain" />
                              </PlatformMediaViewer>
                            ) : (
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
                            )
                          )}
                          <p
                            className={`text-[10px] mt-1 ${
                              isOwn ? "text-blue-200" : "text-gray-400"
                            }`}
                          >
                            {formatTime(msg.created_at)}
                          </p>
                          {!msg.deleted_at && (
                            <div className={`mt-1.5 flex items-center gap-1 ${isOwn ? "justify-end" : "justify-start"} opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition`}>
                              <button
                                onClick={() => runMessageAction(msg, msg.pinned_at ? "unpin" : "pin")}
                                disabled={actionBusy === msg.id}
                                className={`rounded-full p-1 ${isOwn ? "hover:bg-white/15" : "hover:bg-gray-300/70"}`}
                                title={msg.pinned_at ? "Unpin" : "Pin"}
                              >
                                {actionBusy === msg.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pin className="w-3 h-3" />}
                              </button>
                              <button
                                onClick={() => runMessageAction(msg, starred ? "unstar" : "star")}
                                disabled={actionBusy === msg.id}
                                className={`rounded-full p-1 ${isOwn ? "hover:bg-white/15" : "hover:bg-gray-300/70"}`}
                                title={starred ? "Unstar" : "Star"}
                              >
                                <Star className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => runMessageAction(msg, bookmarked ? "unbookmark" : "bookmark")}
                                disabled={actionBusy === msg.id}
                                className={`rounded-full p-1 ${isOwn ? "hover:bg-white/15" : "hover:bg-gray-300/70"}`}
                                title={bookmarked ? "Remove bookmark" : "Bookmark"}
                              >
                                <Bookmark className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => runMessageAction(msg, "translate")}
                                disabled={actionBusy === msg.id || !msg.message}
                                className={`rounded-full p-1 ${isOwn ? "hover:bg-white/15" : "hover:bg-gray-300/70"}`}
                                title="Translate"
                              >
                                <Languages className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {!isAtLatest && (
              <button
                type="button"
                onClick={() => scrollToLatest("smooth")}
                className="absolute bottom-[76px] right-4 z-10 inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-full bg-[#08129C] px-3 text-xs font-semibold text-white shadow-lg"
                aria-label="Go to the latest message"
              >
                <ChevronDown className="h-4 w-4" />
                {newMessageCount > 0 && <span>{newMessageCount > 99 ? "99+" : newMessageCount}</span>}
              </button>
            )}

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
