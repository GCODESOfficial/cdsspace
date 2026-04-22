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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentThread = threads.find((t) => t.id === selectedThread) || null;

  const fetchThreads = useCallback(async () => {
    try {
      const r = await fetch("/api/team/chat/threads", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) return;
      setThreads(j.threads || []);
      setViewer(j.viewer ? { kind: j.viewer.kind, id: null } : null);
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!selectedThread) return;
    setMessagesLoading(true);
    try {
      const r = await fetch(`/api/team/chat/messages?threadId=${selectedThread}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) return;
      setMessages(j.messages || []);
      if (j.viewer) setViewer(j.viewer);
      // Mark read
      await fetch("/api/team/chat/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selectedThread }),
      });
    } finally {
      setMessagesLoading(false);
    }
  }, [selectedThread]);

  useEffect(() => {
    fetchThreads();
    const iv = setInterval(fetchThreads, 5000);
    return () => clearInterval(iv);
  }, [fetchThreads]);

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

  async function send() {
    if (!selectedThread || !input.trim() || sending) return;
    setSending(true);
    const payload = { threadId: selectedThread, body: input.trim() };
    setInput("");
    try {
      await fetch("/api/team/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await fetchMessages();
      await fetchThreads();
    } finally {
      setSending(false);
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
    if (t.kind === "direct") return "Direct message";
    return "Untitled";
  }

  return (
    <div className="flex h-[calc(100vh-160px)] min-h-[500px] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "w-full md:w-[320px] shrink-0 border-r border-gray-100 flex flex-col bg-[#fafbfd]",
          mobileShowThread && "hidden md:flex"
        )}
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-[#0D1B39]">Team chat</h2>
          <p className="text-[11.5px] text-gray-400">
            {viewer?.kind === "admin" ? "All threads + broadcasts" : "Your channels, DMs, and broadcasts"}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-[#0A4FE8]" />
            </div>
          ) : threads.length === 0 ? (
            <p className="px-5 py-10 text-center text-[12px] text-gray-400">
              No threads yet. Create a department to seed one.
            </p>
          ) : (
            <ul className="py-2">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => {
                      setSelectedThread(t.id);
                      setMobileShowThread(true);
                    }}
                    className={cn(
                      "w-full text-left px-5 py-3 flex items-start gap-3 transition",
                      selectedThread === t.id ? "bg-white" : "hover:bg-white/60"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        t.kind === "admin_broadcast" ? "bg-amber-100 text-amber-700" : "bg-[#0A4FE8]/10 text-[#0A4FE8]"
                      )}
                    >
                      {threadIcon(t)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold text-[#0D1B39] truncate">{threadLabel(t)}</p>
                        {t.unread_count > 0 && (
                          <span className="shrink-0 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#0A4FE8] text-white">
                            {t.unread_count}
                          </span>
                        )}
                      </div>
                      <p className="text-[11.5px] text-gray-400 truncate">
                        {t.last_message?.body || <span className="italic">No messages yet</span>}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Main */}
      <section className={cn("flex-1 flex flex-col", !mobileShowThread && "hidden md:flex")}>
        {!selectedThread ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Pick a thread on the left to start chatting.
          </div>
        ) : (
          <>
            <header className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
              <button
                onClick={() => setMobileShowThread(false)}
                className="md:hidden p-1.5 rounded-lg hover:bg-gray-50"
                aria-label="Back"
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <div className="w-9 h-9 rounded-lg bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center">
                {currentThread ? threadIcon(currentThread) : <Hash className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-[#0D1B39] truncate">
                  {currentThread ? threadLabel(currentThread) : ""}
                </p>
                <p className="text-[11px] text-gray-400">
                  {currentThread?.kind === "department" && "Department channel"}
                  {currentThread?.kind === "admin_broadcast" && "Company-wide broadcast"}
                  {currentThread?.kind === "group" && "Group"}
                  {currentThread?.kind === "direct" && "Direct message"}
                </p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-6 bg-[#fafbfd]">
              {messagesLoading && messages.length === 0 ? (
                <div className="flex justify-center pt-10">
                  <Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-gray-400 pt-10">Say hello — start the conversation.</p>
              ) : (
                <ul className="space-y-4">
                  {messages.map((m) => {
                    const mine =
                      viewer?.kind === "team"
                        ? m.sender_id === viewer.id
                        : viewer?.kind === "admin" && m.sender_is_admin;
                    return (
                      <li key={m.id} className={cn("flex gap-2.5", mine ? "flex-row-reverse" : "flex-row")}>
                        {!mine && (
                          <div className="shrink-0">
                            {m.sender_avatar ? (
                              <img src={m.sender_avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-[#0A4FE8] text-white text-[11px] font-bold flex items-center justify-center">
                                {m.sender_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                        )}
                        <div className={cn("max-w-[70%] group", mine && "items-end flex flex-col")}>
                          {!mine && (
                            <p className="text-[10.5px] text-gray-500 mb-0.5 px-1">
                              {m.sender_name}
                              {m.sender_is_admin && (
                                <span className="ml-1 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold">
                                  ADMIN
                                </span>
                              )}
                            </p>
                          )}
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-2.5 text-[13px] leading-[1.55] shadow-sm",
                              mine ? "bg-[#0A4FE8] text-white rounded-br-md" : "bg-white text-[#0D1B39] rounded-bl-md border border-gray-100"
                            )}
                          >
                            {m.forwarded && (
                              <div
                                className={cn(
                                  "text-[11px] mb-1.5 pl-2.5 border-l-2 flex items-start gap-1",
                                  mine ? "border-white/50 text-white/85" : "border-[#0A4FE8]/30 text-gray-500"
                                )}
                              >
                                <CornerDownRight className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>
                                  Forwarded · originally from{" "}
                                  <span className="font-semibold">{m.forwarded.original_sender_name}</span>
                                </span>
                              </div>
                            )}
                            <div className="whitespace-pre-wrap break-words">{m.body}</div>
                            {m.attachment_url && (
                              <a
                                href={m.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                                className={cn("block mt-1.5 underline text-[11.5px]", mine ? "text-white/90" : "text-[#0A4FE8]")}
                              >
                                View attachment
                              </a>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 px-1">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <button
                              onClick={() => setForwarding(m)}
                              className="opacity-0 group-hover:opacity-100 transition text-[10px] text-gray-400 hover:text-[#0A4FE8] inline-flex items-center gap-0.5"
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

            <div className="border-t border-gray-100 p-4 bg-white">
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Write a message…"
                  className="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || sending}
                  className="inline-flex items-center gap-1.5 px-4 py-3 bg-[#0A4FE8] text-white text-[13px] font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send
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
    setForwarding(false);
    if (!r.ok || !j.ok) {
      setError(j.error || "Couldn't forward that message");
      return;
    }
    onDone();
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
            <p className="text-[11px] text-gray-400 mt-0.5">
              Pick a destination. Only the original sender will show — not who forwarded.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="px-5 pt-3 pb-2 bg-[#fafbfd] border-b border-gray-100 rounded-xl p-3 text-[12px] text-gray-500 italic line-clamp-2">
          “{message.body || message.attachment_url || ""}”
        </div>

        {viewerKind === "admin" && (
          <div className="px-5 pt-3 flex gap-2 text-[12px]">
            <button
              onClick={() => setMode("team")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-medium",
                mode === "team" ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
              )}
            >
              Team chat
            </button>
            <button
              onClick={() => setMode("client")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-medium",
                mode === "client" ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
              )}
            >
              Client chat
            </button>
          </div>
        )}

        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11.5px] px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {mode === "team" ? (
            teamFiltered.length === 0 ? (
              <p className="text-center text-[12px] text-gray-400 py-8">No matching threads.</p>
            ) : (
              <ul className="space-y-0.5">
                {teamFiltered.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => forward("team", t.id)}
                      disabled={forwarding}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 transition flex items-center gap-2.5 disabled:opacity-50"
                    >
                      <div className="w-7 h-7 rounded-lg bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center text-[11px] font-bold">
                        {t.kind.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-[13px] text-[#0D1B39] truncate">{t.name || "Direct message"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : clientFiltered.length === 0 ? (
            <p className="text-center text-[12px] text-gray-400 py-8">No client rooms.</p>
          ) : (
            <ul className="space-y-0.5">
              {clientFiltered.map((c) => (
                <li key={c.roomId}>
                  <button
                    onClick={() => forward("client", c.roomId)}
                    disabled={forwarding}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 transition flex items-center gap-2.5 disabled:opacity-50"
                  >
                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center">
                      {(c.client?.full_name || c.client?.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-[#0D1B39] truncate">{c.client?.full_name || c.client?.email}</p>
                      <p className="text-[10.5px] text-gray-400 truncate">{c.lastMessage}</p>
                    </div>
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
