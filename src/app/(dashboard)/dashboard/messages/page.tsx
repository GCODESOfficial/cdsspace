"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCheck,
  Bookmark,
  ChevronLeft,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Phone,
  Send,
  SmilePlus,
  Star,
  Reply,
  X,
  Users,
  Video,
  Pin,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";
import { Linkified, LinkPreview, firstUrl } from "@/components/chat/message-links";
import { ChatSidebarPreview } from "@/components/chat/chat-sidebar-preview";
import { validateChatUpload } from "@/lib/chat-upload-limits";
import { appAlert } from "@/lib/app-notify";
import { initials } from "@/lib/utils";
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

interface ClientThread {
  id: string;
  kind: "direct" | "project";
  name: string;
  projectId: string | null;
  isAnnouncementOnly: boolean;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
}

interface ClientMessage {
  id: string;
  text: string;
  attachmentUrl: string | null;
  fileName: string | null;
  createdAt: string;
  isMine: boolean;
  senderName: string;
  pending?: boolean;
  replyToMessageId?: string | null;
  replyTo?: { id: string; senderName: string; text: string } | null;
  reactions?: Record<string, string[]>;
  starredBy?: string[];
  bookmarkedBy?: string[];
  pinnedAt?: string | null;
}

function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function displayFileName(message: ClientMessage) {
  if (message.fileName) return message.fileName;
  if (message.text.startsWith("📎 ")) return message.text.slice(3).trim() || "Attachment";
  if (!message.attachmentUrl) return "Attachment";
  try {
    const path = new URL(message.attachmentUrl).pathname;
    return decodeURIComponent(path.split("/").pop() || "Attachment");
  } catch {
    return "Attachment";
  }
}

function isImageAttachment(url: string | null) {
  if (!url) return false;
  try {
    return /\.(png|jpe?g|webp|gif)$/i.test(new URL(url, window.location.origin).pathname);
  } catch {
    return false;
  }
}

export default function ClientMessagesPage() {
  const { account } = useClientAccount();
  const [threads, setThreads] = useState<ClientThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [startingCall, setStartingCall] = useState<"voice" | "video" | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<{ url: string; title: string } | null>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ClientMessage | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [isAtLatest, setIsAtLatest] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const isAtLatestRef = useRef(true);
  const initialScrollPending = useRef(true);
  const renderedLastMessageId = useRef<string | null>(null);
  const threadsRequestActive = useRef(false);
  const messagesRequestActive = useRef(false);
  const threadsSnapshot = useRef("");
  const messagesSnapshot = useRef("");
  const sendingRef = useRef(false);

  const selected = useMemo(
    () => threads.find((thread) => thread.id === selectedId) || null,
    [threads, selectedId],
  );
  const selectedKind = selected?.kind || null;

  const loadThreads = useCallback(async () => {
    if (threadsRequestActive.current) return;
    threadsRequestActive.current = true;
    try {
      const response = await fetch("/api/client/chat/threads", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load conversations");
      const next = (payload.threads || []) as ClientThread[];
      const snapshot = JSON.stringify(next);
      if (snapshot !== threadsSnapshot.current) {
        threadsSnapshot.current = snapshot;
        setThreads(next);
      }
      setSelectedId((current) => current && next.some((thread) => thread.id === current) ? current : next[0]?.id || null);
    } catch (error) {
      console.error(error);
    } finally {
      threadsRequestActive.current = false;
      setLoadingThreads(false);
    }
  }, []);

  const loadMessages = useCallback(async (quiet = false) => {
    if (!selectedId || !selectedKind || messagesRequestActive.current || (quiet && sendingRef.current)) return;
    messagesRequestActive.current = true;
    if (!quiet) setLoadingMessages(true);
    try {
      const endpoint = selectedKind === "direct"
        ? `/api/chat/messages?roomId=${encodeURIComponent(selectedId)}&limit=200`
        : `/api/client/chat/project/messages?threadId=${encodeURIComponent(selectedId)}`;
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load messages");

      if (selectedKind === "direct") {
        const raw = payload.messages || [];
        const mapped = raw.map((message: any) => ({
          id: message.id,
          text: message.message || "",
          attachmentUrl: message.file_url || null,
          fileName: null,
          createdAt: message.created_at,
          isMine: message.sender_role === "client" && message.sender_id === account.userId,
          senderName: message.sender_role === "client" ? account.fullName || "You" : "CDS Space",
          replyToMessageId: message.reply_to_message_id || null,
          reactions: message.reactions || {},
          starredBy: message.starred_by || [],
          bookmarkedBy: message.bookmarked_by || [],
          pinnedAt: message.pinned_at || null,
        }));
        const byId = new Map<string, ClientMessage>(
          mapped.map((message: ClientMessage) => [message.id, message]),
        );
        const nextMessages = mapped.map((message: ClientMessage) => {
          const repliedMessage = message.replyToMessageId
            ? byId.get(message.replyToMessageId)
            : undefined;
          return {
            ...message,
            replyTo: repliedMessage
              ? {
                  id: repliedMessage.id,
                  senderName: repliedMessage.senderName,
                  text: repliedMessage.text || "Attachment",
                }
              : null,
          };
        });
        const snapshot = JSON.stringify(nextMessages);
        if (snapshot !== messagesSnapshot.current) {
          messagesSnapshot.current = snapshot;
          setMessages(nextMessages);
        }
        const hasUnreadAdminMessage = raw.some(
          (message: any) => message.sender_role === "admin" && message.is_read === false,
        );
        if (hasUnreadAdminMessage) {
          await fetch("/api/chat/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId: selectedId, actor: "client" }),
          });
        }
      } else {
        const nextMessages = (payload.messages || []).map((message: any) => ({
          id: message.id,
          text: message.body || "",
          attachmentUrl: message.attachment_url || null,
          fileName: message.file_name || null,
          createdAt: message.created_at,
          isMine: message.client_user_id === account.userId,
          senderName: message.client_user_id === account.userId ? account.fullName || "You" : message.sender_name || "CDS Space",
          replyToMessageId: message.reply_to_message_id || null,
          replyTo: message.reply_to ? {
            id: message.reply_to.id,
            senderName: message.reply_to.sender_name || "Participant",
            text: message.reply_to.body || (message.reply_to.attachment_url ? "Attachment" : "Message"),
          } : null,
          reactions: message.reactions || {},
          starredBy: message.starred_by || [],
          bookmarkedBy: message.bookmarked_by || [],
          pinnedAt: message.pinned_at || null,
        }));
        const snapshot = JSON.stringify(nextMessages);
        if (snapshot !== messagesSnapshot.current) {
          messagesSnapshot.current = snapshot;
          setMessages(nextMessages);
        }
      }
    } catch (error) {
      if (!quiet) await appAlert(error instanceof Error ? error.message : "Could not load messages");
    } finally {
      messagesRequestActive.current = false;
      if (!quiet) setLoadingMessages(false);
    }
  }, [account.fullName, account.userId, selectedId, selectedKind]);

  useEffect(() => {
    void loadThreads();
    const interval = window.setInterval(() => {
      if (!document.hidden) void loadThreads();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedId || !selectedKind) return;
    initialScrollPending.current = true;
    renderedLastMessageId.current = null;
    isAtLatestRef.current = true;
    setIsAtLatest(true);
    setNewMessageCount(0);
    messagesSnapshot.current = "";
    void loadMessages();
    const interval = window.setInterval(() => {
      if (!document.hidden) void loadMessages(true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadMessages, selectedId, selectedKind]);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    endRef.current?.scrollIntoView({ behavior, block: "end" });
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
    if (isAtLatestRef.current || last.isMine) requestAnimationFrame(() => scrollToLatest(last.isMine ? "smooth" : "auto"));
    else setNewMessageCount((count) => count + 1);
  }, [messages, scrollToLatest]);

  useEffect(() => {
    const count = messages.filter((message) => Boolean(message.pinnedAt)).length;
    setPinnedIndex((current) => count ? Math.min(current, count - 1) : 0);
  }, [messages]);

  const sendMessage = async (options?: {
    text?: string;
    attachmentUrl?: string;
    fileName?: string;
    fileSizeBytes?: number;
    mimeType?: string;
    replyToMessageId?: string | null;
  }) => {
    if (!selected || sending || selected.isAnnouncementOnly) return;
    const text = (options?.text ?? input).trim();
    if (!text && !options?.attachmentUrl) return;

    const replyTarget = replyingTo;
    const optimisticId = `temp-${Date.now()}`;
    setMessages((current) => [...current, {
      id: optimisticId,
      text,
      attachmentUrl: options?.attachmentUrl || null,
      fileName: options?.fileName || null,
      createdAt: new Date().toISOString(),
      isMine: true,
      senderName: account.fullName || "You",
      pending: true,
      replyToMessageId: options?.replyToMessageId || replyTarget?.id || null,
      replyTo: replyTarget ? { id: replyTarget.id, senderName: replyTarget.senderName, text: replyTarget.text || "Attachment" } : null,
      reactions: {},
    }]);
    requestAnimationFrame(() => scrollToLatest("smooth"));
    setInput("");
    setReplyingTo(null);
    setSending(true);
    sendingRef.current = true;
    try {
      const response = selected.kind === "direct"
        ? await fetch("/api/chat/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomId: selected.id,
              message: text || `📎 ${options?.fileName || "Attachment"}`,
              fileUrl: options?.attachmentUrl,
              actor: "client",
              replyToMessageId: options?.replyToMessageId || replyTarget?.id || null,
            }),
          })
        : await fetch("/api/client/chat/project/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              threadId: selected.id,
              body: text || `📎 ${options?.fileName || "Attachment"}`,
              attachmentUrl: options?.attachmentUrl,
              fileName: options?.fileName,
              fileSizeBytes: options?.fileSizeBytes,
              mimeType: options?.mimeType,
              replyToMessageId: options?.replyToMessageId || replyTarget?.id || null,
            }),
          });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Message could not be sent");
      await Promise.all([loadMessages(true), loadThreads()]);
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      if (!options?.attachmentUrl) setInput(text);
      if (replyTarget) setReplyingTo(replyTarget);
      await appAlert(error instanceof Error ? error.message : "Message could not be sent");
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const runMessageAction = async (
    message: ClientMessage,
    action: "react" | "star" | "unstar" | "bookmark" | "unbookmark",
    emoji?: string,
  ) => {
    if (!selected || message.id.startsWith("temp-") || actionBusy) return;
    setActionBusy(message.id);
    try {
      const endpoint = selected.kind === "direct"
        ? action === "react"
          ? `/api/chat/messages/${message.id}/reactions`
          : `/api/chat/messages/${message.id}/actions`
        : `/api/client/chat/project/messages/${message.id}/actions`;
      const body = action === "react"
        ? selected.kind === "direct" ? { emoji } : { action, emoji }
        : { action, actor: "client" };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw new Error(payload.error || "Message action failed");
      await loadMessages(true);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Message action failed");
    } finally {
      setActionBusy(null);
    }
  };

  const uploadFile = async (file: File) => {
    if (!selected || selected.isAnnouncementOnly) return;
    const check = validateChatUpload(file.size, file.type || "");
    if (!check.ok) return appAlert(check.error);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      if (selected.kind === "project") formData.set("threadId", selected.id);
      const response = await fetch("/api/client/chat/upload", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Upload failed");
      await sendMessage({
        text: `📎 ${payload.fileName}`,
        attachmentUrl: payload.publicUrl,
        fileName: payload.fileName,
        fileSizeBytes: payload.fileSizeBytes,
        mimeType: payload.mimeType,
      });
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const startCall = async (kind: "voice" | "video") => {
    if (!selected || startingCall || selected.isAnnouncementOnly) return;
    setStartingCall(kind);
    try {
      const response = await fetch("/api/client/chat/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, targetKind: selected.kind, targetId: selected.id }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not start the call");
      setActiveMeeting({
        url: payload.link,
        title: `${kind === "voice" ? "Voice" : "Video"} call · ${selected.name}`,
      });
      await Promise.all([loadMessages(true), loadThreads()]);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not start the call");
    } finally {
      setStartingCall(null);
    }
  };

  const grouped = useMemo(() => {
    const groups: Array<{ label: string; items: ClientMessage[] }> = [];
    for (const message of messages) {
      const label = dateLabel(message.createdAt);
      const group = groups[groups.length - 1];
      if (group?.label === label) group.items.push(message);
      else groups.push({ label, items: [message] });
    }
    return groups;
  }, [messages]);

  const pinnedMessages = useMemo(() => messages
    .filter((message) => Boolean(message.pinnedAt))
    .sort((a, b) => new Date(b.pinnedAt || b.createdAt).getTime() - new Date(a.pinnedAt || a.createdAt).getTime()), [messages]);
  const activePinnedMessage = pinnedMessages[Math.min(pinnedIndex, Math.max(0, pinnedMessages.length - 1))] || null;

  const showPinnedMessage = (index: number) => {
    if (!pinnedMessages.length) return;
    const next = (index + pinnedMessages.length) % pinnedMessages.length;
    setPinnedIndex(next);
    document.getElementById(`client-message-${pinnedMessages[next].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div data-chat-shell className="flex h-[calc(100dvh-64px)] min-h-0 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:h-[calc(100dvh-112px)] sm:rounded-[22px] sm:border lg:h-[calc(100dvh-120px)]">
      <aside className={`${showConversation ? "hidden md:flex" : "flex"} w-full flex-col border-e border-slate-200 bg-white md:w-80 lg:w-[340px]`}>
        <div data-chat-sidebar-header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
          <div data-directional-copy className="min-w-0 flex-1 text-start">
            <h1 className="text-[15px] font-bold text-[#0D1B39]">Chat/Meet</h1>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-400">Direct messages and project groups</p>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]">
            <MessageSquare className="h-5 w-5" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loadingThreads ? (
            <div className="flex h-32 items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => { setSelectedId(thread.id); setShowConversation(true); }}
              className={`mb-2 flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-start transition ${selectedId === thread.id ? "border-blue-500 bg-blue-50/70" : "border-transparent hover:bg-slate-50"}`}
            >
              <div data-directional-copy className="min-w-0 flex-1 text-start">
                <div className="flex items-center gap-2">
                  <p className="flex-1 truncate text-[13px] font-bold text-[#0D1B39]">{thread.name}</p>
                  {thread.unreadCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#0A4FE8] px-1 text-[10px] font-bold text-white">{thread.unreadCount}</span>}
                </div>
                <ChatSidebarPreview text={thread.lastMessage} className="mt-1 h-4 text-[11px] text-slate-400" />
                <p className="mt-1 text-[10px] font-medium text-slate-300">{thread.kind === "project" ? "Project group" : "Private conversation"}</p>
              </div>
              <div className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl ${thread.kind === "project" ? "bg-indigo-50 text-indigo-600" : "bg-blue-50 text-[#0A4FE8]"}`}>
                {thread.kind === "project" ? <Users className="h-5 w-5" /> : <Image src="/favicon.png" alt="CDS Space" width={44} height={44} className="h-full w-full object-cover" />}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className={`${showConversation ? "flex" : "hidden md:flex"} relative min-w-0 flex-1 flex-col bg-[linear-gradient(135deg,#f8fbff_0%,#eef4ff_52%,#f8fafc_100%)]`}>
        {selected ? (
          <>
            <header data-chat-thread className="flex min-h-[72px] shrink-0 items-center gap-2 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur-xl sm:gap-3 sm:px-5">
              <button onClick={() => setShowConversation(false)} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Back to conversations">
                <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
              </button>
              <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-2xl bg-[#0A4FE8] text-[11px] font-bold text-white">
                {selected.kind === "project" ? <Users className="h-5 w-5" /> : <Image src="/favicon.png" alt="CDS Space" width={40} height={40} className="h-full w-full object-cover" priority />}
              </div>
              <div data-directional-copy className="min-w-0 flex-1 text-start">
                <h2 className="truncate text-[14px] font-bold text-[#0D1B39]">{selected.name}</h2>
                <p className="truncate text-[11px] text-slate-400">{selected.kind === "project" ? "Shared with your project team" : "CDS Space client support"}</p>
              </div>
              <button onClick={() => void startCall("voice")} disabled={!!startingCall || selected.isAnnouncementOnly} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-blue-50 hover:text-[#0A4FE8] disabled:opacity-40" title="Start audio call">
                {startingCall === "voice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
              </button>
              <button onClick={() => void startCall("video")} disabled={!!startingCall || selected.isAnnouncementOnly} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-blue-50 hover:text-[#0A4FE8] disabled:opacity-40" title="Start video call">
                {startingCall === "video" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              </button>
            </header>

            {activePinnedMessage && (
              <div className="flex shrink-0 items-center gap-2 border-b border-blue-100 bg-white/95 px-3 py-2 sm:px-5">
                <button type="button" onClick={() => showPinnedMessage(pinnedIndex)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-start transition hover:bg-blue-50">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Pin className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block text-[10px] font-semibold text-[#0A4FE8]">Pinned message #{pinnedIndex + 1} of {pinnedMessages.length}</span><span className="block truncate text-[12px] text-slate-500">{activePinnedMessage.text || displayFileName(activePinnedMessage)}</span></span>
                </button>
                {pinnedMessages.length > 1 && <div className="flex shrink-0 flex-col"><button type="button" onClick={() => showPinnedMessage(pinnedIndex - 1)} className="grid h-6 w-7 place-items-center rounded-md text-slate-400 hover:bg-blue-50 hover:text-[#0A4FE8]" aria-label="Previous pinned message"><ChevronUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => showPinnedMessage(pinnedIndex + 1)} className="grid h-6 w-7 place-items-center rounded-md text-slate-400 hover:bg-blue-50 hover:text-[#0A4FE8]" aria-label="Next pinned message"><ChevronDown className="h-3.5 w-3.5" /></button></div>}
              </div>
            )}

            <div ref={messagesScrollRef} onScroll={handleMessagesScroll} dir="ltr" className="flex-1 overflow-y-auto px-3 py-5 sm:px-7 sm:py-6">
              {loadingMessages ? (
                <div className="flex h-full items-center justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-white text-[#0A4FE8] shadow-sm"><MessageSquare className="h-7 w-7" /></div>
                  <h3 className="font-bold text-[#0D1B39]">Start the conversation</h3>
                  <p className="mt-1 max-w-sm text-[12px] text-slate-400">Messages, documents, and call invitations stay together here.</p>
                </div>
              ) : grouped.map((group) => (
                <section key={group.label} className="mb-7">
                  <div className="mb-5 flex items-center gap-3"><div className="h-px flex-1 bg-slate-200" /><span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-slate-400">{group.label}</span><div className="h-px flex-1 bg-slate-200" /></div>
                  <div className="space-y-4">
                    {group.items.map((message) => {
                      const viewerKey = `client:${account.userId}`;
                      const starred = (message.starredBy || []).includes(viewerKey);
                      const bookmarked = (message.bookmarkedBy || []).includes(viewerKey);
                      const previewUrl = firstUrl(message.text);
                      return (
                      <ContextMenu key={message.id}>
                        <ContextMenuTrigger asChild>
                      <div id={`client-message-${message.id}`} className={`flex items-end gap-2 ${message.isMine ? "justify-end" : "justify-start"}`}>
                        {!message.isMine && (
                          <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#0A4FE8] text-[10px] font-bold text-white">
                            {selected.kind === "direct" || message.senderName === "CDS Space" ? (
                              <Image
                                src="/favicon.png"
                                alt="CDS Space support"
                                width={32}
                                height={32}
                                className="h-full w-full object-cover"
                              />
                            ) : initials(message.senderName)}
                          </div>
                        )}
                        <div className={`flex max-w-[82%] flex-col sm:max-w-[72%] ${message.isMine ? "items-end" : "items-start"}`}>
                          {!message.isMine && <p className="mb-1 px-1 text-[10px] font-semibold text-slate-500">{message.senderName}</p>}
                          <div dir="auto" className={`rounded-[20px] border px-4 py-3 text-start text-[13px] leading-6 shadow-sm ${message.isMine ? "rounded-br-md border-blue-600 bg-[#0A4FE8] text-white" : "rounded-bl-md border-slate-200 bg-white text-[#0D1B39]"}`}>
                            {message.pinnedAt && <span className={`mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${message.isMine ? "bg-white/15 text-white" : "bg-blue-50 text-[#0A4FE8]"}`}><Pin className="h-3 w-3" />Pinned</span>}
                            {message.replyTo && (
                              <button type="button" onClick={() => document.getElementById(`client-message-${message.replyTo!.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className={`mb-2 block w-full rounded-xl border-s-2 px-3 py-2 text-start ${message.isMine ? "border-white/60 bg-white/10" : "border-blue-400 bg-blue-50"}`}>
                                <span className={`block text-[10px] font-semibold ${message.isMine ? "text-blue-100" : "text-blue-600"}`}>{message.replyTo.senderName}</span>
                                <span className={`block max-w-sm truncate text-[11px] ${message.isMine ? "text-white/80" : "text-slate-500"}`}>{message.replyTo.text}</span>
                              </button>
                            )}
                            {message.text && !(message.attachmentUrl && message.text.startsWith("📎 ")) && (
                              <Linkified
                                text={message.text}
                                className="whitespace-pre-wrap break-words"
                                onMeetingLink={(url) => setActiveMeeting({
                                  url,
                                  title: `${selected.name} · cMeet call`,
                                })}
                              />
                            )}
                            {previewUrl && <LinkPreview url={previewUrl} variant={message.isMine ? "dark" : "light"} />}
                            {message.attachmentUrl && (
                              isImageAttachment(message.attachmentUrl) ? (
                                <a href={message.attachmentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-white/20 bg-white/10">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={message.attachmentUrl} alt={displayFileName(message)} className="max-h-80 w-full object-contain" />
                                </a>
                              ) : (
                                <a href={message.attachmentUrl} target="_blank" rel="noopener noreferrer" className={`mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 ${message.isMine ? "border-white/25 bg-white/10" : "border-slate-200 bg-slate-50"}`}>
                                  <FileText className="h-4 w-4 shrink-0" />
                                  <span className="min-w-0 truncate text-[11px] font-semibold">{displayFileName(message)}</span>
                                </a>
                              )
                            )}
                            <div className={`mt-1.5 flex items-center justify-end gap-1 text-[9px] ${message.isMine ? "text-blue-100" : "text-slate-400"}`}>
                              {timeLabel(message.createdAt)}
                              {message.isMine && !message.pending && <CheckCheck className="h-3 w-3" />}
                              {message.pending && <Loader2 className="h-3 w-3 animate-spin" />}
                            </div>
                            {Object.entries(message.reactions || {}).some(([, users]) => users.length > 0) && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {Object.entries(message.reactions || {}).filter(([, users]) => users.length > 0).map(([emoji, users]) => (
                                  <button key={emoji} type="button" onClick={() => void runMessageAction(message, "react", emoji)} className={`rounded-full border px-2 py-0.5 text-[10px] ${users.includes(viewerKey) ? "border-blue-300 bg-blue-100 text-blue-800" : message.isMine ? "border-white/25 bg-white/10" : "border-slate-200 bg-slate-50"}`}>{emoji} {users.length}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-52">
                          <ContextMenuItem onClick={() => setReplyingTo(message)}><Reply className="me-2 h-4 w-4" />Reply</ContextMenuItem>
                          <ContextMenuItem onClick={() => void runMessageAction(message, "react", "👍")}><SmilePlus className="me-2 h-4 w-4" />React 👍</ContextMenuItem>
                          <ContextMenuItem onClick={() => void runMessageAction(message, "react", "❤️")}><span className="me-2">❤️</span>React with love</ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => void runMessageAction(message, starred ? "unstar" : "star")}><Star className="me-2 h-4 w-4" />{starred ? "Remove star" : "Star message"}</ContextMenuItem>
                          <ContextMenuItem onClick={() => void runMessageAction(message, bookmarked ? "unbookmark" : "bookmark")}><Bookmark className="me-2 h-4 w-4" />{bookmarked ? "Remove saved" : "Save message"}</ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );})}
                  </div>
                </section>
              ))}
              <div ref={endRef} />
            </div>

            {!isAtLatest && (
              <button
                type="button"
                onClick={() => scrollToLatest("smooth")}
                className="absolute bottom-[84px] right-4 z-20 inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-[#0A4FE8] px-3 text-xs font-semibold text-white shadow-xl shadow-blue-900/25 transition hover:bg-[#083FC0]"
                aria-label="Go to the latest message"
                title="Go to the latest message"
              >
                <ChevronDown className="h-5 w-5" />
                {newMessageCount > 0 && <span>{newMessageCount > 99 ? "99+" : newMessageCount}</span>}
              </button>
            )}

            <footer data-chat-composer dir="ltr" className="shrink-0 border-t border-slate-200 bg-white/95 p-3 sm:p-4">
              {selected.isAnnouncementOnly ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-[12px] font-semibold text-amber-700">This project channel is read-only.</div>
              ) : (
                <div>
                  {replyingTo && (
                    <div className="mb-2 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-start">
                      <Reply className="h-4 w-4 shrink-0 text-[#0A4FE8]" />
                      <div className="min-w-0 flex-1"><p className="text-[10px] font-bold text-blue-700">Replying to {replyingTo.senderName}</p><p className="truncate text-[11px] text-slate-500">{replyingTo.text || "Attachment"}</p></div>
                      <button type="button" onClick={() => setReplyingTo(null)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white" aria-label="Cancel reply"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading || sending} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#0A4FE8] disabled:opacity-40" title="Send a document">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </button>
                  <input dir="auto" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Type a message..." className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-start text-[13px] text-[#0D1B39] outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
                  <button onClick={() => void sendMessage()} disabled={!input.trim() || sending} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0A4FE8] text-white shadow-lg shadow-blue-600/20 transition hover:bg-[#083FC0] disabled:opacity-40" aria-label="Send message">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                </div>
              )}
            </footer>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-slate-400"><MessageSquare className="mb-3 h-10 w-10" /><p className="text-sm">Select a conversation</p></div>
        )}
      </main>
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
