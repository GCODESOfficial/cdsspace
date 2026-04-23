"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Hash,
  Megaphone,
  Users as UsersIcon,
  User,
  Loader2,
  ChevronLeft,
  Forward,
  CornerDownRight,
  X,
  Search,
  Plus,
  Check,
  Sparkles,
  Paperclip,
  BrainCircuit,
  MessageSquarePlus,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Thread {
  id: string;
  kind: "direct" | "group" | "department" | "admin_broadcast";
  name: string | null;
  department: string | null;
  includes_admin: boolean;
  last_message: {
    id: string;
    body: string | null;
    sender_is_admin: boolean;
    created_at: string;
  } | null;
  unread_count: number;
}

interface Message {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_is_admin: boolean;
  sender_name: string;
  sender_avatar: string | null;
  body: string | null;
  attachment_url: string | null;
  forwarded: {
    original_sender_name: string;
    original_body: string;
    original_created_at: string | null;
    original_source: "client" | "team";
  } | null;
  created_at: string;
}

interface ViewerInfo {
  kind: "admin" | "team";
  id: string | null;
}

interface ClientRoom {
  roomId: string;
  client: { id: string; email: string; full_name: string | null } | null;
  lastMessage: string;
}

interface AiSuggestion {
  label: string;
  body: string;
}

/** Shared team-chat UI. Same panel for admins and team members. */
export function TeamChatPanel({ initialThreadId }: { initialThreadId?: string | null } = {}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<string | null>(initialThreadId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [viewer, setViewer] = useState<ViewerInfo | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(!!initialThreadId);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [showingNewChat, setShowingNewChat] = useState(false);
  
  // AI States
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentThread = threads.find((t) => t.id === selectedThread) || null;

  async function fetchThreads() {
    setThreadsLoading(true);
    try {
      const res = await fetch("/api/team/chat/threads", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setThreads(json.threads);
        if (json.viewer) setViewer(json.viewer);
      }
    } catch { /* ignore */ }
    setThreadsLoading(false);
  }

  const fetchMessages = useCallback(async () => {
    if (!selectedThread) return;
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/team/chat/messages?threadId=${selectedThread}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setMessages(json.messages);
    } catch { /* ignore */ }
    setMessagesLoading(false);
  }, [selectedThread]);

  // AI: Fetch suggestions based on the last message
  async function generateSuggestions() {
    if (!messages.length || suggestionsLoading || !selectedThread) return;
    const lastMsg = messages[messages.length - 1];
    const amISender = viewer?.kind === "team" ? lastMsg.sender_id === viewer.id : lastMsg.sender_is_admin;
    if (amISender) {
      setSuggestions([]); // Clear if I was the last one to speak
      return;
    }

    setSuggestionsLoading(true);
    try {
      const historySummary = messages.slice(-5).map(m => `${m.sender_name}: ${m.body}`).join("\n");
      const r = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "chat_reply_suggestions",
          input: {
            channel: currentThread?.kind || "direct",
            from: lastMsg.sender_name,
            last_message: lastMsg.body,
            history: historySummary
          },
        }),
      });
      const j = await r.json();
      if (j.ok && Array.isArray(j.data?.suggestions)) {
        setSuggestions(j.data.suggestions);
      }
    } catch (e) {
      console.error("AI Suggestions error:", e);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  // Trigger when a new message that isn't mine arrives
  useEffect(() => {
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      const amISender = viewer?.kind === "team" ? last.sender_id === viewer.id : last.sender_is_admin;
      if (!amISender) {
        generateSuggestions();
      } else {
        setSuggestions([]);
      }
    }
  }, [messages.length]);

  async function triggerAiRewrite() {
    if (!input.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const r = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "chat_smart_compose",
          input: { draft: input.trim() },
        }),
      });
      const j = await r.json();
      if (j.ok && j.text) {
        setInput(j.text);
      }
    } catch (e) {
      console.error("AI Rewrite error:", e);
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => {
    fetchThreads();
  }, []);

  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      return;
    }
    fetchMessages();
    const iv = setInterval(fetchMessages, 4000);
    return () => clearInterval(iv);
  }, [selectedThread, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(overrideBody?: string) {
    if (!selectedThread || (sending && !overrideBody)) return;
    const body = (overrideBody || input).trim();
    if (!body) return;
    
    setSending(true);
    if (!overrideBody) setInput("");
    setSuggestions([]); // Clear suggestions once we reply
    
    try {
      await fetch("/api/team/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selectedThread, body }),
      });
      await fetchMessages();
      await fetchThreads();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedThread) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/team/chat/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");

      // Send the message with attachment
      await fetch("/api/team/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: selectedThread,
          body: `Sent an attachment: ${file.name}`,
          attachmentUrl: json.publicUrl,
        }),
      });
      await fetchMessages();
      await fetchThreads();
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function threadIcon(t: Thread) {
    if (t.kind === "department") return <Hash className="w-3.5 h-3.5" />;
    if (t.kind === "admin_broadcast") return <Megaphone className="w-3.5 h-3.5" />;
    if (t.kind === "group") return <UsersIcon className="w-3.5 h-3.5" />;
    return <User className="w-3.5 h-3.5" />;
  }

  function threadLabel(t: Thread) {
    if (t.name) return t.name;
    if (t.kind === "direct") {
      if (t.includes_admin) return "Admin";
      return "Direct message";
    }
    return "Untitled";
  }

  return (
    <div className="flex h-[calc(100vh-160px)] min-h-[600px] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "w-full md:w-[320px] shrink-0 border-r border-gray-100 flex flex-col bg-[#fafbfd]",
          mobileShowThread && "hidden md:flex"
        )}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#0D1B39]">Team chat</h2>
            <p className="text-[11.5px] text-gray-400">
              {viewer?.kind === "admin" ? "All threads + broadcasts" : "Your channels, DMs, and broadcasts"}
            </p>
          </div>
          <button
            onClick={() => setShowingNewChat(true)}
            className="p-2 rounded-xl bg-[#0A4FE8] text-white hover:bg-[#083EC0] transition-colors shadow-sm"
            title="Start new chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-[#0A4FE8]" />
            </div>
          ) : threads.length === 0 ? (
            <p className="px-5 py-10 text-center text-[12px] text-gray-400">
              No threads yet.
            </p>
          ) : (
            <ul className="py-2">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => {
                      setSelectedThread(t.id);
                      setMobileShowThread(true);
                      setSuggestions([]);
                    }}
                    className={cn(
                      "w-full text-left px-5 py-3.5 flex items-start gap-3 transition relative group",
                      selectedThread === t.id ? "bg-white" : "hover:bg-white/60"
                    )}
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs",
                        t.kind === "admin_broadcast" ? "bg-amber-100 text-amber-700" : "bg-[#0A4FE8]/10 text-[#0A4FE8]"
                      )}
                    >
                      {threadIcon(t)}
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center justify-between gap-2 overflow-hidden">
                        <span className="text-[13px] font-semibold text-[#0D1B39] truncate">{threadLabel(t)}</span>
                        {t.unread_count > 0 && (
                          <span className="shrink-0 w-4 h-4 rounded-full bg-[#0A4FE8] text-white text-[9px] font-bold flex items-center justify-center">
                            {t.unread_count}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-gray-400 truncate mt-0.5">
                        {t.last_message?.body || "No messages yet"}
                      </p>
                    </div>
                    {selectedThread === t.id && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#0A4FE8] rounded-r-lg" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Main Panel */}
      <section className={cn("flex-1 flex flex-col min-w-0 bg-white", !mobileShowThread && "hidden md:flex")}>
        {!selectedThread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#fafbfd]">
            <div className="w-16 h-16 rounded-3xl bg-[#0A4FE8]/5 text-[#0A4FE8] flex items-center justify-center mb-4">
              <MessageSquarePlus className="w-8 h-8" />
            </div>
            <h3 className="text-[16px] font-semibold text-[#0D1B39]">Select a conversation</h3>
            <p className="text-[13px] text-gray-500 max-w-[280px] mt-1.5">
              Pick a thread from the sidebar or start a new conversation with your team.
            </p>
          </div>
        ) : (
          <>
            <header className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white z-10">
              <div className="flex items-center gap-3 overflow-hidden">
                <button
                  onClick={() => setMobileShowThread(false)}
                  className="md:hidden p-1.5 -ml-1 text-gray-400 hover:text-[#0D1B39]"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-xl bg-[#0A4FE8]/5 text-[#0A4FE8] flex items-center justify-center shrink-0">
                  {currentThread ? threadIcon(currentThread) : <User className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold text-[#0D1B39] truncate">
                    {currentThread ? threadLabel(currentThread) : "Chat"}
                  </h2>
                  <p className="text-[11.5px] text-gray-400 truncate">
                    {currentThread?.kind === "department" && `Department: ${currentThread.department}`}
                    {currentThread?.kind === "admin_broadcast" && "Company-wide broadcast"}
                    {currentThread?.kind === "group" && "Team Group"}
                    {currentThread?.kind === "direct" && "Direct message"}
                  </p>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-6 bg-[#fafbfd] relative">
              {messagesLoading && messages.length === 0 ? (
                <div className="flex justify-center pt-10">
                  <Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center pt-20 text-center opacity-60">
                   <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                     <BrainCircuit className="w-6 h-6 text-gray-400" />
                   </div>
                   <p className="text-sm text-gray-400">Say hello — start the conversation.</p>
                </div>
              ) : (
                <ul className="space-y-6">
                  {messages.map((m) => {
                    const mine =
                      viewer?.kind === "team"
                        ? m.sender_id === viewer.id
                        : viewer?.kind === "admin" && m.sender_is_admin;
                    return (
                      <li key={m.id} className={cn("flex gap-3", mine ? "flex-row-reverse" : "flex-row")}>
                        {!mine && (
                          <div className="shrink-0 mt-1">
                            {m.sender_avatar ? (
                              <img src={m.sender_avatar} alt="" className="w-8 h-8 rounded-xl object-cover shadow-sm" />
                            ) : (
                              <div className="w-8 h-8 rounded-xl bg-[#0A4FE8] text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                                {m.sender_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                        )}
                        <div className={cn("max-w-[75%] group", mine && "items-end flex flex-col")}>
                          {!mine && (
                            <p className="text-[10.5px] font-semibold text-gray-400 mb-1 px-1 flex items-center gap-1.5">
                              {m.sender_name}
                              {m.sender_is_admin && (
                                <span className="inline-block px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[8.5px] font-bold uppercase tracking-wider">
                                  Admin
                                </span>
                              )}
                            </p>
                          )}
                          <div
                            className={cn(
                              "relative group rounded-2xl px-4 py-2.5 text-[13px] leading-[1.6] shadow-sm",
                              mine 
                                ? "bg-[#0A4FE8] text-white rounded-tr-none" 
                                : "bg-white text-[#0D1B39] rounded-tl-none border border-gray-100/80"
                            )}
                          >
                            {m.forwarded && (
                              <div
                                className={cn(
                                  "text-[11px] mb-2 pl-3 border-l-2 flex items-start gap-1.5 italic",
                                  mine ? "border-white/40 text-white/80" : "border-[#0A4FE8]/20 text-gray-400"
                                )}
                              >
                                <CornerDownRight className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>
                                  Forwarded · From{" "}
                                  <span className="font-bold underline decoration-dotted underline-offset-2">{m.forwarded.original_sender_name}</span>
                                </span>
                              </div>
                            )}
                            <div className="whitespace-pre-wrap break-words">{m.body}</div>
                            {m.attachment_url && (
                              <div className={cn(
                                "mt-2.5 p-2 rounded-lg flex items-center gap-3 border",
                                mine ? "bg-white/10 border-white/20" : "bg-blue-50/50 border-blue-100/50"
                              )}>
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                  mine ? "bg-white/20 text-white" : "bg-white text-[#0A4FE8] shadow-xs"
                                )}>
                                  <Paperclip className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={cn("text-[11px] font-medium truncate", mine ? "text-white" : "text-[#0D1B39]")}>
                                    File Attachment
                                  </p>
                                  <a
                                    href={m.attachment_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={cn(
                                      "text-[10px] font-bold uppercase tracking-wider hover:opacity-80 transition flex items-center gap-1 mt-0.5",
                                      mine ? "text-white/80" : "text-[#0A4FE8]"
                                    )}
                                  >
                                    Download / View
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className={cn("mt-1.5 flex items-center gap-3 px-1", mine && "flex-row-reverse")}>
                            <span className="text-[10px] text-gray-300 font-medium tracking-tight">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <button
                              onClick={() => setForwarding(m)}
                              className="opacity-0 group-hover:opacity-100 transition text-[10px] font-bold text-gray-400 hover:text-[#0A4FE8] uppercase tracking-wide inline-flex items-center gap-1"
                            >
                              <Forward className="w-3 h-3" /> Forward
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* AI Suggestions Row */}
            {suggestions.length > 0 && (
              <div className="bg-[#fafbfd] px-5 py-2 flex flex-wrap gap-2 animate-in slide-in-from-bottom-2 duration-300">
                 {suggestions.map((s, idx) => (
                   <button
                     key={idx}
                     onClick={() => send(s.body)}
                     disabled={sending}
                     className="px-3.5 py-1.5 rounded-full bg-white border border-blue-100 text-[11.5px] font-medium text-[#0A4FE8] shadow-xs hover:bg-blue-50 hover:border-blue-200 transition-all flex items-center gap-1.5"
                   >
                     <Wand2 className="w-3 h-3" />
                     {s.label}
                   </button>
                 ))}
                 <button 
                  onClick={() => setSuggestions([])}
                  className="p-1.5 text-gray-300 hover:text-gray-500"
                 >
                   <X className="w-3 h-3" />
                 </button>
              </div>
            )}

            <div className="border-t border-gray-100 p-4 bg-white relative">
              {suggestionsLoading && (
                <div className="absolute -top-8 left-6 flex items-center gap-2 bg-white/80 backdrop-blur-md border border-blue-50 px-3 py-1 rounded-full shadow-xs">
                   <Loader2 className="w-3 h-3 animate-spin text-[#0A4FE8]" />
                   <span className="text-[10px] font-bold text-[#0A4FE8] uppercase tracking-widest">AI Thinking...</span>
                </div>
              )}
              
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*,.pdf"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="p-3 rounded-xl text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition border border-transparent hover:border-blue-100/50"
                  title="Upload image or PDF"
                >
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                </button>
                <div className="flex-1 relative flex items-center">
                  <textarea
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder="Type a message..."
                    className="w-full pl-4 pr-12 py-3 rounded-2xl bg-gray-50 border border-transparent text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white focus:border-blue-200 transition-all resize-none overflow-hidden"
                    style={{ lineHeight: '1.5' }}
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    {input.trim() && (
                      <button
                        onClick={triggerAiRewrite}
                        disabled={aiLoading}
                        className="p-2 rounded-lg text-[#0A4FE8] hover:bg-blue-50 transition"
                        title="AI Refine (Smart Compose)"
                      >
                        {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => send()}
                  disabled={(!input.trim() && !uploading) || sending}
                  className="shrink-0 w-12 h-12 flex items-center justify-center bg-[#0A4FE8] text-white rounded-2xl hover:bg-[#083EC0] transition shadow-[0_4px_12px_rgba(10,79,232,0.25)] disabled:opacity-50 disabled:shadow-none"
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {forwarding && (
        <ForwardDialog
          message={forwarding}
          viewerKind={viewer?.kind || "team"}
          onClose={() => setForwarding(null)}
          onDone={async () => {
            setForwarding(null);
            await fetchMessages();
          }}
        />
      )}

      {showingNewChat && (
        <NewChatRoomDialog
          onClose={() => setShowingNewChat(false)}
          onCreated={(threadId) => {
            setShowingNewChat(false);
            fetchThreads();
            setSelectedThread(threadId);
            setMobileShowThread(true);
          }}
        />
      )}
    </div>
  );
}

function ForwardDialog({
  message,
  viewerKind,
  onClose,
  onDone,
}: {
  message: Message;
  viewerKind: "admin" | "team";
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"team" | "client">("team");
  const [teamThreads, setTeamThreads] = useState<Thread[]>([]);
  const [clientRooms, setClientRooms] = useState<ClientRoom[]>([]);
  const [search, setSearch] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/team/chat/threads", { cache: "no-store" });
      const j = await r.json();
      if (r.ok && j.ok) setTeamThreads(j.threads || []);
    })();
    if (viewerKind === "admin") {
      (async () => {
        const r = await fetch("/api/chat/rooms", { cache: "no-store" });
        const j = await r.json();
        if (r.ok && j.rooms) setClientRooms(j.rooms || []);
      })();
    }
  }, [viewerKind]);

  async function forward(targetKind: "team" | "client", targetId: string) {
    setForwarding(true);
    setError(null);
    try {
      const r = await fetch("/api/chat/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "team",
          source_id: message.id,
          target: targetKind,
          target_id: targetId,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || "Couldn't forward that message");
      } else {
        onDone();
      }
    } catch (e) {
      setError("Network error");
    } finally {
      setForwarding(false);
    }
  }

  const teamFiltered = teamThreads.filter((t) => (t.name || "").toLowerCase().includes(search.toLowerCase()));
  const clientFiltered = clientRooms.filter((c) =>
    (c.client?.full_name || c.client?.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-[#0D1B39]">Forward message</h3>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">
              Original: {message.body || "Attachment"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50 transition">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people or groups..."
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {viewerKind === "admin" && (
            <div className="flex bg-gray-50 p-1 rounded-xl">
              <button
                onClick={() => setMode("team")}
                className={cn(
                  "flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition",
                  mode === "team" ? "bg-white text-[#0A4FE8] shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Team Threads
              </button>
              <button
                onClick={() => setMode("client")}
                className={cn(
                  "flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition",
                  mode === "client" ? "bg-white text-[#0A4FE8] shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Client Rooms
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {mode === "team" ? (
             <div className="space-y-1">
               {teamFiltered.length === 0 && <p className="p-8 text-center text-xs text-gray-400">No threads found</p>}
               {teamFiltered.map((t) => (
                 <button
                   key={t.id}
                   onClick={() => forward("team", t.id)}
                   disabled={forwarding}
                   className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 transition group"
                 >
                   <div className="w-8 h-8 rounded-lg bg-blue-100/50 text-[#0A4FE8] flex items-center justify-center shrink-0">
                     {t.kind === "department" ? <Hash className="w-4 h-4" /> : t.kind === "group" ? <UsersIcon className="w-4 h-4" /> : <User className="w-4 h-4" />}
                   </div>
                   <span className="text-[13px] text-[#0D1B39] font-medium group-hover:text-[#0A4FE8] transition capitalize">
                     {t.name || (t.kind === "direct" ? "User" : "Untitled")}
                   </span>
                   {forwarding && <Loader2 className="w-3 h-3 animate-spin ml-auto text-blue-300" />}
                 </button>
               ))}
             </div>
          ) : (
            <div className="space-y-1">
               {clientFiltered.length === 0 && <p className="p-8 text-center text-xs text-gray-400">No clients found</p>}
               {clientFiltered.map((c) => (
                 <button
                   key={c.roomId}
                   onClick={() => forward("client", c.roomId)}
                   disabled={forwarding}
                   className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-emerald-50 transition group"
                 >
                   <div className="w-8 h-8 rounded-lg bg-emerald-100/50 text-emerald-600 flex items-center justify-center shrink-0">
                     <User className="w-4 h-4" />
                   </div>
                   <div className="flex flex-col items-start min-w-0">
                     <span className="text-[13px] text-[#0D1B39] font-medium group-hover:text-emerald-600 transition truncate w-full">
                       {c.client?.full_name || c.client?.email || "Unknown Client"}
                     </span>
                     <span className="text-[10px] text-gray-400 truncate w-full">{c.client?.email}</span>
                   </div>
                   {forwarding && <Loader2 className="w-3 h-3 animate-spin ml-auto text-emerald-300" />}
                 </button>
               ))}
            </div>
          )}
        </div>

        {error && (
          <div className="px-5 py-3 border-t border-rose-50 bg-rose-50/50 text-rose-500 text-[11px] font-medium">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function NewChatRoomDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<"direct" | "group">("direct");
  const [name, setName] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/team-members");
      const json = await res.json();
      if (json.ok) setMembers(json.members);
    })();
  }, []);

  const filtered = members.filter((m) =>
    (m.full_name || m.username || "").toLowerCase().includes(search.toLowerCase())
  );

  async function create() {
    if (kind === "group" && !name.trim()) {
      setError("Group name is required");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Pick at least one person");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: kind === "group" ? name : null,
          participant_ids: selectedIds,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        onCreated(json.thread_id);
      } else {
        setError(json.error || "Failed to create thread");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    if (kind === "direct") {
      setSelectedIds([id]);
    } else {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-[#0D1B39]">Start new conversation</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50 transition">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1 overflow-y-auto">
          <div className="flex bg-gray-50 p-1.5 rounded-2xl">
            <button
              onClick={() => {
                setKind("direct");
                setSelectedIds(selectedIds.slice(0, 1));
              }}
              className={cn(
                "flex-1 py-2.5 text-[12px] font-bold uppercase tracking-wider rounded-xl transition",
                kind === "direct" ? "bg-white text-[#0A4FE8] shadow-sm" : "text-gray-400 hover:text-gray-600"
              )}
            >
              Direct Message
            </button>
            <button
              onClick={() => setKind("group")}
              className={cn(
                "flex-1 py-2.5 text-[12px] font-bold uppercase tracking-wider rounded-xl transition",
                kind === "group" ? "bg-white text-[#0A4FE8] shadow-sm" : "text-gray-400 hover:text-gray-600"
              )}
            >
              Group Chat
            </button>
          </div>

          {kind === "group" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">Group Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marketing Strategy, Project Alpha, etc."
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-transparent focus:ring-2 focus:ring-blue-100 focus:bg-white focus:border-blue-200 transition text-[13px]"
              />
            </div>
          )}

          <div className="space-y-3">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">
              Select {kind === "direct" ? "Person" : "Participants"}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team members..."
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-transparent rounded-xl text-[13px] focus:ring-2 focus:ring-blue-100 focus:bg-white focus:border-blue-200 transition"
              />
            </div>
            <div className="grid grid-cols-1 gap-1">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition",
                    selectedIds.includes(m.id)
                      ? "bg-blue-50 border-[#0A4FE8]/20"
                      : "bg-white border-transparent hover:bg-gray-50"
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center font-bold text-xs uppercase">
                    {m.full_name?.charAt(0) || m.username.charAt(0)}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[13px] font-semibold text-[#0D1B39] truncate">{m.full_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">@{m.username}</p>
                  </div>
                  {selectedIds.includes(m.id) && (
                    <div className="w-5 h-5 rounded-full bg-[#0A4FE8] flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex flex-col gap-3">
          {error && <p className="text-rose-500 text-xs font-semibold text-center">{error}</p>}
          <button
            onClick={create}
            disabled={loading}
            className="w-full h-12 bg-[#0A4FE8] text-white rounded-xl font-semibold text-[14px] shadow-lg shadow-[#0A4FE8]/20 hover:bg-[#083EC0] transition flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Start Chat"}
          </button>
        </div>
      </div>
    </div>
  );
}
