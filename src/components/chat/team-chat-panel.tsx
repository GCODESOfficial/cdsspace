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
  Phone,
  Video,
  SmilePlus,
  Palette,
  Shapes,
  Reply,
  Trash2,
  Pencil,
  MoreHorizontal,
  CheckCheck,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Linkified, LinkPreview, firstUrl } from "@/components/chat/message-links";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface Thread {
  id: string;
  kind: "direct" | "group" | "department" | "admin_broadcast";
  name: string | null;
  department: string | null;
  includes_admin: boolean;
  last_message: {
    id: string;
    body: string | null;
    attachment_url: string | null;
    sticker_key: string | null;
    deleted_at: string | null;
    sender_is_admin: boolean;
    created_at: string;
  } | null;
  last_message_preview?: string;
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
  reply_to_message_id: string | null;
  sticker_key: string | null;
  reactions: Record<string, string[]>;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to: {
    id: string;
    sender_name: string;
    body: string | null;
    attachment_url: string | null;
    sticker_key: string | null;
    deleted_at: string | null;
    created_at: string;
  } | null;
  created_at: string;
}

interface ViewerInfo {
  kind: "admin" | "team";
  id: string | null;
  displayName: string;
  reactionKey: string;
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

type ComposerPanel = "emoji" | "stickers" | "background" | null;
type ChatBackgroundKey = "mist" | "linen" | "ocean" | "midnight";

const CHAT_BG_KEY = "cds_team_chat_bg";
const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "👏", "🔥", "🙏", "🎉"];
const EMOJI_GROUPS = [
  { label: "Popular", items: ["😀", "😂", "😍", "😭", "😮", "🙏", "👏", "🔥", "🎉", "❤️"] },
  { label: "Quick tone", items: ["👍", "👀", "✅", "💡", "🙌", "🤝", "💯", "😊", "😅", "🤔"] },
];
const STICKERS = [
  { key: "cheer-burst", emoji: "🎉", title: "Celebrate", background: "linear-gradient(135deg, #f59e0b, #ef4444)" },
  { key: "love-note", emoji: "💙", title: "Appreciate", background: "linear-gradient(135deg, #2563eb, #7c3aed)" },
  { key: "great-job", emoji: "👏", title: "Great job", background: "linear-gradient(135deg, #06b6d4, #2563eb)" },
  { key: "mind-blown", emoji: "🤯", title: "Mind blown", background: "linear-gradient(135deg, #fb7185, #f97316)" },
  { key: "ship-it", emoji: "🚀", title: "Ship it", background: "linear-gradient(135deg, #14b8a6, #0ea5e9)" },
  { key: "coffee-break", emoji: "☕", title: "Coffee", background: "linear-gradient(135deg, #a16207, #78350f)" },
];
const CHAT_BACKGROUNDS: Record<
  ChatBackgroundKey,
  {
    label: string;
    shell: string;
    canvas: string;
    composer: string;
    mineBubble: string;
    otherBubble: string;
    otherBorder: string;
    accent: string;
    lightChip: string;
    dark: boolean;
  }
> = {
  mist: {
    label: "Blue mist",
    shell: "linear-gradient(180deg, #f8fbff 0%, #eef3ff 100%)",
    canvas:
      "radial-gradient(circle at top, rgba(59,130,246,0.18), transparent 34%), linear-gradient(180deg, #f9fbff 0%, #eff4ff 100%)",
    composer: "rgba(255,255,255,0.88)",
    mineBubble: "linear-gradient(180deg, #0A4FE8 0%, #083DBE 100%)",
    otherBubble: "rgba(255,255,255,0.96)",
    otherBorder: "rgba(226,232,240,0.9)",
    accent: "#0A4FE8",
    lightChip: "rgba(255,255,255,0.8)",
    dark: false,
  },
  linen: {
    label: "Soft linen",
    shell: "linear-gradient(180deg, #fffaf2 0%, #f7f3ec 100%)",
    canvas:
      "radial-gradient(circle at top right, rgba(251,191,36,0.16), transparent 32%), linear-gradient(180deg, #fffdf8 0%, #f8f3ea 100%)",
    composer: "rgba(255,252,247,0.9)",
    mineBubble: "linear-gradient(180deg, #1d4ed8 0%, #1e40af 100%)",
    otherBubble: "rgba(255,255,255,0.94)",
    otherBorder: "rgba(234,221,202,0.9)",
    accent: "#1d4ed8",
    lightChip: "rgba(255,255,255,0.78)",
    dark: false,
  },
  ocean: {
    label: "Ocean glass",
    shell: "linear-gradient(180deg, #f0fbff 0%, #e0f2fe 100%)",
    canvas:
      "radial-gradient(circle at top left, rgba(34,197,94,0.18), transparent 28%), radial-gradient(circle at top right, rgba(14,165,233,0.16), transparent 30%), linear-gradient(180deg, #f0fcff 0%, #e0f2fe 100%)",
    composer: "rgba(255,255,255,0.86)",
    mineBubble: "linear-gradient(180deg, #0f766e 0%, #115e59 100%)",
    otherBubble: "rgba(255,255,255,0.94)",
    otherBorder: "rgba(186,230,253,0.95)",
    accent: "#0f766e",
    lightChip: "rgba(255,255,255,0.78)",
    dark: false,
  },
  midnight: {
    label: "Midnight",
    shell: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
    canvas:
      "radial-gradient(circle at top, rgba(14,165,233,0.16), transparent 28%), radial-gradient(circle at bottom right, rgba(139,92,246,0.2), transparent 34%), linear-gradient(180deg, #0f172a 0%, #111827 100%)",
    composer: "rgba(15,23,42,0.84)",
    mineBubble: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
    otherBubble: "rgba(15,23,42,0.82)",
    otherBorder: "rgba(71,85,105,0.78)",
    accent: "#60a5fa",
    lightChip: "rgba(15,23,42,0.72)",
    dark: true,
  },
};

function isInlineImageBody(body: string | null) {
  return /^\[\[image:([^\]]+)\]\]$/.exec(body || "");
}

function getSticker(stickerKey: string | null | undefined) {
  return STICKERS.find((sticker) => sticker.key === stickerKey) || null;
}

function describeMessage(message: {
  body?: string | null;
  attachment_url?: string | null;
  sticker_key?: string | null;
  deleted_at?: string | null;
}) {
  if (message.deleted_at) return "Message deleted";
  if (message.sticker_key) return "Sticker";
  if (isInlineImageBody(message.body || null)) return "Photo";
  if (message.attachment_url) return "Attachment";
  return message.body?.trim() || "Message";
}

function formatDayDivider(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatClock(dateString: string) {
  return new Date(dateString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  const [starting, setStarting] = useState<"voice" | "video" | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(!!initialThreadId);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [showingNewChat, setShowingNewChat] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [composerPanel, setComposerPanel] = useState<ComposerPanel>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [chatBackground, setChatBackground] = useState<ChatBackgroundKey>("mist");
  const [swipeHint, setSwipeHint] = useState<{ id: string; offset: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const lastRenderedThreadRef = useRef<string | null>(null);
  const syncBusyRef = useRef(false);
  const touchStateRef = useRef<{
    id: string;
    x: number;
    y: number;
    longPressId: number | null;
  } | null>(null);

  const currentThread = threads.find((thread) => thread.id === selectedThread) || null;
  const currentTheme = CHAT_BACKGROUNDS[chatBackground];

  useEffect(() => {
    syncBusyRef.current = sending || uploading;
  }, [sending, uploading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(CHAT_BG_KEY);
    if (saved === "mist" || saved === "linen" || saved === "ocean" || saved === "midnight") {
      setChatBackground(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CHAT_BG_KEY, chatBackground);
  }, [chatBackground]);

  async function fetchThreads() {
    setThreadsLoading(true);
    try {
      const res = await fetch("/api/team/chat/threads", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setThreads(json.threads);
        if (json.viewer) setViewer(json.viewer);
      }
    } catch {
      /* ignore */
    }
    setThreadsLoading(false);
  }

  const fetchMessages = useCallback(
    async (force = false) => {
      if (!selectedThread) return;
      if (!force && syncBusyRef.current) return;
      setMessagesLoading(true);
      try {
        const res = await fetch(`/api/team/chat/messages?threadId=${selectedThread}`, { cache: "no-store" });
        const json = await res.json();
        if (json.ok) {
          setMessages(json.messages);
          if (json.viewer) setViewer(json.viewer);
        }
      } catch {
        /* ignore */
      }
      setMessagesLoading(false);
    },
    [selectedThread],
  );

  const markThreadRead = useCallback(
    async (threadId: string) => {
      if (viewer?.kind !== "team") return;
      setThreads((prev) => prev.map((thread) => (thread.id === threadId ? { ...thread, unread_count: 0 } : thread)));
      try {
        await fetch("/api/team/chat/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId }),
        });
      } catch {
        /* ignore */
      }
    },
    [viewer?.kind],
  );

  async function generateSuggestions() {
    if (!messages.length || suggestionsLoading || !selectedThread) return;

    const lastMsg = messages[messages.length - 1];
    const amISender = viewer?.kind === "team" ? lastMsg.sender_id === viewer.id : lastMsg.sender_is_admin;
    if (amISender) {
      setSuggestions([]);
      return;
    }

    setSuggestionsLoading(true);
    try {
      const historySummary = messages.slice(-5).map((message) => `${message.sender_name}: ${message.body}`).join("\n");
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "chat_reply_suggestions",
          input: {
            channel: currentThread?.kind || "direct",
            from: lastMsg.sender_name,
            last_message: lastMsg.body,
            history: historySummary,
          },
        }),
      });
      const json = await res.json();
      if (json.ok && Array.isArray(json.data?.suggestions)) {
        setSuggestions(json.data.suggestions);
      }
    } catch (error) {
      console.error("AI Suggestions error:", error);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function triggerAiRewrite() {
    if (!input.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "chat_smart_compose",
          input: { draft: input.trim() },
        }),
      });
      const json = await res.json();
      if (json.ok && json.text) {
        setInput(json.text);
      }
    } catch (error) {
      console.error("AI Rewrite error:", error);
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      const amISender = viewer?.kind === "team" ? lastMessage.sender_id === viewer.id : lastMessage.sender_is_admin;
      if (!amISender) generateSuggestions();
      else setSuggestions([]);
    }
  }, [messages.length]);

  useEffect(() => {
    fetchThreads();
  }, []);

  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      return;
    }

    lastRenderedThreadRef.current = null;
    fetchMessages(true);
    markThreadRead(selectedThread);

    const interval = setInterval(() => {
      fetchMessages();
      markThreadRead(selectedThread);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedThread, fetchMessages, markThreadRead]);

  useEffect(() => {
    if (!selectedThread) return;
    const justOpened = lastRenderedThreadRef.current !== selectedThread;
    messagesEndRef.current?.scrollIntoView({ behavior: justOpened ? "auto" : "smooth", block: "end" });
    if (messages.length > 0) lastRenderedThreadRef.current = selectedThread;
  }, [messages.length, selectedThread]);

  useEffect(() => {
    if (!composerRef.current) return;
    composerRef.current.style.height = "0px";
    composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 156)}px`;
  }, [input, editingMessageId]);

  useEffect(() => {
    if (!reactionPickerFor) return;
    const close = () => setReactionPickerFor(null);
    const timer = window.setTimeout(() => document.addEventListener("click", close), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", close);
    };
  }, [reactionPickerFor]);

  function threadIcon(thread: Thread) {
    if (thread.kind === "department") return <Hash className="w-3.5 h-3.5" />;
    if (thread.kind === "admin_broadcast") return <Megaphone className="w-3.5 h-3.5" />;
    if (thread.kind === "group") return <UsersIcon className="w-3.5 h-3.5" />;
    return <User className="w-3.5 h-3.5" />;
  }

  function threadLabel(thread: Thread) {
    if (thread.name) return thread.name;
    if (thread.kind === "direct") {
      if (thread.includes_admin) return "Admin";
      return "Direct message";
    }
    return "Untitled";
  }

  function focusComposer() {
    window.setTimeout(() => composerRef.current?.focus(), 50);
  }

  function resetComposerState() {
    setEditingMessageId(null);
    setReplyingTo(null);
    setComposerPanel(null);
  }

  function scrollToMessage(messageId: string) {
    const node = messageRefs.current[messageId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.classList.add("ring-2", "ring-blue-200");
    window.setTimeout(() => node.classList.remove("ring-2", "ring-blue-200"), 1200);
  }

  function queueReply(message: Message) {
    setReplyingTo(message);
    setEditingMessageId(null);
    setActionMessage(null);
    setComposerPanel(null);
    focusComposer();
  }

  function beginEdit(message: Message) {
    if (!message.body || message.deleted_at || message.sticker_key || (!message.body && message.attachment_url)) return;
    setEditingMessageId(message.id);
    setReplyingTo(null);
    setInput(message.body);
    setActionMessage(null);
    setComposerPanel(null);
    focusComposer();
  }

  function updateMessageLocally(nextMessage: Message) {
    setMessages((prev) => prev.map((message) => (message.id === nextMessage.id ? nextMessage : message)));
  }

  async function saveEdit() {
    if (!editingMessageId || !input.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/team/chat/messages/${editingMessageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: input.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to edit message");
      updateMessageLocally(json.message);
      setInput("");
      resetComposerState();
      await fetchThreads();
    } catch (error) {
      console.error(error);
    } finally {
      setSending(false);
    }
  }

  async function sendMessage({
    body,
    attachmentUrl,
    stickerKey,
  }: {
    body?: string | null;
    attachmentUrl?: string | null;
    stickerKey?: string | null;
  } = {}) {
    if (!selectedThread || sending) return;
    if (editingMessageId && body === undefined && !attachmentUrl && !stickerKey) {
      await saveEdit();
      return;
    }

    const normalizedBody = (body ?? input).trim();
    if (!normalizedBody && !attachmentUrl && !stickerKey) return;

    setSending(true);
    const tempId = `temp_${Date.now()}`;
    const replyTarget = replyingTo;
    const optimisticMessage: Message = {
      id: tempId,
      thread_id: selectedThread,
      sender_id: viewer?.kind === "team" ? viewer.id : null,
      sender_is_admin: viewer?.kind === "admin",
      sender_name: viewer?.displayName || (viewer?.kind === "admin" ? "Admin" : "You"),
      sender_avatar: null,
      body: normalizedBody || null,
      attachment_url: attachmentUrl || null,
      forwarded: null,
      reply_to_message_id: replyTarget?.id || null,
      sticker_key: stickerKey || null,
      reactions: {},
      edited_at: null,
      deleted_at: null,
      reply_to: replyTarget
        ? {
            id: replyTarget.id,
            sender_name: replyTarget.sender_name,
            body: replyTarget.body,
            attachment_url: replyTarget.attachment_url,
            sticker_key: replyTarget.sticker_key,
            deleted_at: replyTarget.deleted_at,
            created_at: replyTarget.created_at,
          }
        : null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setInput("");
    setSuggestions([]);
    resetComposerState();

    try {
      const res = await fetch("/api/team/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: selectedThread,
          body: normalizedBody || null,
          attachmentUrl: attachmentUrl || null,
          stickerKey: stickerKey || null,
          replyToMessageId: replyTarget?.id || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to send message");
      setMessages((prev) => prev.map((message) => (message.id === tempId ? json.message : message)));
      await fetchThreads();
    } catch (error) {
      console.error(error);
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      if (!stickerKey && !attachmentUrl) setInput(normalizedBody);
    } finally {
      setSending(false);
    }
  }

  async function startCall(kind: "voice" | "video") {
    if (!currentThread || starting) return;
    setStarting(kind);
    try {
      const title =
        kind === "voice"
          ? `Voice call — ${threadLabel(currentThread)}`
          : `Video call — ${threadLabel(currentThread)}`;
      const res = await fetch("/api/cmeet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, audio_only: kind === "voice" }),
      });
      const json = await res.json();
      const roomCode = json?.meeting?.room_code;
      if (!res.ok || !json.ok || !roomCode) throw new Error(json.error || "Couldn't start call");
      // /meet/<code> is the actual cMeet pre-meeting page — it prompts
      // the user for a display name, shows the camera/mic preview, then
      // transitions into the live room. /team/cmeet/<code> was wrong.
      const link = `${window.location.origin}/meet/${roomCode}`;
      await sendMessage({
        body: kind === "voice" ? `📞 Voice call started — join: ${link}` : `🎥 Video call started — join: ${link}`,
      });
      window.open(link, "_blank");
    } catch (error) {
      console.error(error);
    } finally {
      setStarting(null);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedThread) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) {
      alert("Only images and PDFs are supported.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const maxBytes = isPdf ? 20 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert(isPdf ? "PDFs must be 20 MB or smaller." : "Images must be 5 MB or smaller.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    let displayMode: "inline" | "file" = "file";
    if (isImage) {
      const asInline = window.confirm(
        "Show this image inline in the chat?\n\nOK = display as image\nCancel = send as file attachment",
      );
      displayMode = asInline ? "inline" : "file";
    }

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

      const body =
        displayMode === "inline" ? `[[image:${file.name}]]` : `Sent an attachment: ${file.name}`;
      await sendMessage({ body, attachmentUrl: json.publicUrl });
      await fetchThreads();
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (messageId.startsWith("temp_") || !viewer?.reactionKey) return;
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== messageId) return message;
        const reactions = { ...(message.reactions || {}) };
        const list = new Set(reactions[emoji] || []);
        if (list.has(viewer.reactionKey)) list.delete(viewer.reactionKey);
        else list.add(viewer.reactionKey);
        if (list.size === 0) delete reactions[emoji];
        else reactions[emoji] = Array.from(list);
        return { ...message, reactions };
      }),
    );
    setReactionPickerFor(null);
    try {
      await fetch(`/api/team/chat/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch (error) {
      console.error(error);
      fetchMessages(true);
    }
  }

  async function deleteMessage(messageId: string) {
    try {
      const res = await fetch(`/api/team/chat/messages/${messageId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to delete message");
      updateMessageLocally(json.message);
      setActionMessage(null);
      if (editingMessageId === messageId) {
        setInput("");
        resetComposerState();
      }
      await fetchThreads();
    } catch (error) {
      console.error(error);
    }
  }

  function canEditMessage(message: Message) {
    if (message.deleted_at) return false;
    if (viewer?.kind === "admin") return message.sender_is_admin && !message.sticker_key && !!message.body;
    return message.sender_id === viewer?.id && !message.sender_is_admin && !message.sticker_key && !!message.body;
  }

  function canDeleteMessage(message: Message) {
    if (message.deleted_at) return false;
    if (viewer?.kind === "admin") return true;
    return message.sender_id === viewer?.id && !message.sender_is_admin;
  }

  function handleTouchStart(message: Message, event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    const timer = window.setTimeout(() => {
      setActionMessage(message);
      setSwipeHint(null);
    }, 360);
    touchStateRef.current = {
      id: message.id,
      x: touch.clientX,
      y: touch.clientY,
      longPressId: timer,
    };
  }

  function handleTouchMove(message: Message, event: React.TouchEvent<HTMLDivElement>) {
    const state = touchStateRef.current;
    if (!state || state.id !== message.id) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - state.x;
    const deltaY = touch.clientY - state.y;
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      if (state.longPressId) {
        window.clearTimeout(state.longPressId);
        state.longPressId = null;
      }
    }
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setSwipeHint({ id: message.id, offset: Math.max(-64, Math.min(64, deltaX)) });
    }
  }

  function handleTouchEnd(message: Message) {
    const state = touchStateRef.current;
    if (!state || state.id !== message.id) {
      setSwipeHint(null);
      return;
    }
    if (state.longPressId) window.clearTimeout(state.longPressId);
    if (swipeHint && swipeHint.id === message.id && Math.abs(swipeHint.offset) > 52) {
      queueReply(message);
    }
    touchStateRef.current = null;
    setSwipeHint(null);
  }

  const groupedMessages: { label: string; items: Message[] }[] = [];
  messages.forEach((message) => {
    const label = formatDayDivider(message.created_at);
    const lastGroup = groupedMessages[groupedMessages.length - 1];
    if (lastGroup?.label === label) lastGroup.items.push(message);
    else groupedMessages.push({ label, items: [message] });
  });

  return (
    <div
      className="flex h-[calc(100dvh-15rem)] min-h-[520px] md:h-[calc(100vh-160px)] md:min-h-[640px] rounded-[28px] border shadow-sm overflow-hidden"
      style={{
        background: currentTheme.shell,
        borderColor: currentTheme.dark ? "rgba(71,85,105,0.64)" : "rgba(226,232,240,0.8)",
      }}
    >
      <aside
        className={cn("w-full md:w-[320px] shrink-0 border-r flex flex-col backdrop-blur-xl", mobileShowThread && "hidden md:flex")}
        style={{
          background: currentTheme.dark ? "rgba(2,6,23,0.84)" : "rgba(255,255,255,0.82)",
          borderColor: currentTheme.dark ? "rgba(71,85,105,0.58)" : "rgba(226,232,240,0.72)",
        }}
      >
        <div
          className="px-4 sm:px-5 py-4 border-b flex items-center justify-between"
          style={{ borderColor: currentTheme.dark ? "rgba(71,85,105,0.48)" : "rgba(226,232,240,0.72)" }}
        >
          <div>
            <h2 className={cn("text-[15px] font-semibold", currentTheme.dark ? "text-white" : "text-[#0D1B39]")}>Team chat</h2>
            <p className={cn("text-[11.5px]", currentTheme.dark ? "text-slate-400" : "text-gray-400")}>
              {viewer?.kind === "admin" ? "All threads + broadcasts" : "Your channels, DMs, and broadcasts"}
            </p>
          </div>
          <button
            onClick={() => setShowingNewChat(true)}
            className="p-2 rounded-xl text-white transition-colors shadow-sm"
            style={{ background: currentTheme.accent }}
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
            <p className={cn("px-5 py-10 text-center text-[12px]", currentTheme.dark ? "text-slate-400" : "text-gray-400")}>No threads yet.</p>
          ) : (
            <ul className="py-2">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    onClick={() => {
                      setSelectedThread(thread.id);
                      setMobileShowThread(true);
                      setSuggestions([]);
                      resetComposerState();
                    }}
                    className={cn(
                      "w-full text-left px-4 sm:px-5 py-3.5 flex items-start gap-3 transition relative group",
                      selectedThread === thread.id
                        ? currentTheme.dark
                          ? "bg-slate-900/70"
                          : "bg-white/90"
                        : currentTheme.dark
                        ? "hover:bg-slate-900/50"
                        : "hover:bg-white/60",
                    )}
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs",
                        thread.kind === "admin_broadcast" ? "bg-amber-100 text-amber-700" : "bg-[#0A4FE8]/10 text-[#0A4FE8]",
                      )}
                    >
                      {threadIcon(thread)}
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center justify-between gap-2 overflow-hidden">
                        <span className={cn("text-[13px] font-semibold truncate", currentTheme.dark ? "text-white" : "text-[#0D1B39]")}>
                          {threadLabel(thread)}
                        </span>
                        {thread.unread_count > 0 && (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#0A4FE8] text-white text-[9px] font-bold flex items-center justify-center">
                            {thread.unread_count}
                          </span>
                        )}
                      </div>
                      <p className={cn("text-[12px] truncate mt-0.5", currentTheme.dark ? "text-slate-400" : "text-gray-400")}>
                        {thread.last_message_preview || (thread.last_message ? describeMessage(thread.last_message) : "No messages yet")}
                      </p>
                    </div>
                    {selectedThread === thread.id && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-lg" style={{ background: currentTheme.accent }} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className={cn("flex-1 flex flex-col min-w-0", !mobileShowThread && "hidden md:flex")}>
        {!selectedThread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8" style={{ background: currentTheme.canvas }}>
            <div className="w-16 h-16 rounded-3xl bg-[#0A4FE8]/5 text-[#0A4FE8] flex items-center justify-center mb-4">
              <MessageSquarePlus className="w-8 h-8" />
            </div>
            <h3 className={cn("text-[16px] font-semibold", currentTheme.dark ? "text-white" : "text-[#0D1B39]")}>Select a conversation</h3>
            <p className={cn("text-[13px] max-w-[280px] mt-1.5", currentTheme.dark ? "text-slate-400" : "text-gray-500")}>
              Pick a thread from the sidebar or start a new conversation with your team.
            </p>
          </div>
        ) : (
          <>
            <header
              className="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-3 backdrop-blur-xl z-10"
              style={{
                background: currentTheme.composer,
                borderColor: currentTheme.dark ? "rgba(71,85,105,0.54)" : "rgba(226,232,240,0.72)",
              }}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <button
                  onClick={() => setMobileShowThread(false)}
                  className={cn(
                    "md:hidden p-1.5 -ml-1",
                    currentTheme.dark ? "text-slate-400 hover:text-white" : "text-gray-400 hover:text-[#0D1B39]",
                  )}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-xl bg-[#0A4FE8]/5 text-[#0A4FE8] flex items-center justify-center shrink-0">
                  {currentThread ? threadIcon(currentThread) : <User className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className={cn("text-[15px] font-bold truncate", currentTheme.dark ? "text-white" : "text-[#0D1B39]")}>
                    {currentThread ? threadLabel(currentThread) : "Chat"}
                  </h2>
                  <p className={cn("text-[11.5px] truncate", currentTheme.dark ? "text-slate-400" : "text-gray-400")}>
                    {currentThread?.kind === "department" && `Department: ${currentThread.department}`}
                    {currentThread?.kind === "admin_broadcast" && "Company-wide broadcast"}
                    {currentThread?.kind === "group" && "Team Group"}
                    {currentThread?.kind === "direct" && "Direct message"}
                  </p>
                </div>
              </div>

              {currentThread && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setComposerPanel(composerPanel === "background" ? null : "background")}
                    className={cn(
                      "p-2 rounded-xl transition",
                      currentTheme.dark
                        ? "text-slate-300 hover:text-white hover:bg-slate-800/70"
                        : "text-gray-500 hover:text-[#0A4FE8] hover:bg-blue-50",
                    )}
                    title="Change background"
                  >
                    <Palette className="w-4 h-4" />
                  </button>
                  <div className="hidden sm:flex items-center gap-1">
                    <button
                      onClick={() => startCall("voice")}
                      disabled={starting !== null}
                      className={cn(
                        "p-2 rounded-lg transition disabled:opacity-50",
                        currentTheme.dark
                          ? "text-slate-300 hover:text-white hover:bg-slate-800/70"
                          : "text-gray-500 hover:text-[#0A4FE8] hover:bg-blue-50",
                      )}
                      title="Start voice call"
                    >
                      {starting === "voice" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => startCall("video")}
                      disabled={starting !== null}
                      className={cn(
                        "p-2 rounded-lg transition disabled:opacity-50",
                        currentTheme.dark
                          ? "text-slate-300 hover:text-white hover:bg-slate-800/70"
                          : "text-gray-500 hover:text-[#0A4FE8] hover:bg-blue-50",
                      )}
                      title="Start video call"
                    >
                      {starting === "video" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-5 sm:py-6 relative" style={{ background: currentTheme.canvas }}>
              {messagesLoading && messages.length === 0 ? (
                <div className="flex justify-center pt-10">
                  <Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center pt-20 text-center opacity-60">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                    <BrainCircuit className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className={cn("text-sm", currentTheme.dark ? "text-slate-400" : "text-gray-400")}>Say hello — start the conversation.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedMessages.map((group) => (
                    <div key={group.label} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("h-px flex-1", currentTheme.dark ? "bg-slate-700/70" : "bg-slate-200/80")} />
                        <span
                          className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.22em]",
                            currentTheme.dark ? "text-slate-300" : "text-slate-500",
                          )}
                          style={{ background: currentTheme.lightChip }}
                        >
                          {group.label}
                        </span>
                        <div className={cn("h-px flex-1", currentTheme.dark ? "bg-slate-700/70" : "bg-slate-200/80")} />
                      </div>

                      <ul className="space-y-4">
                        {group.items.map((message) => {
                          const mine =
                            viewer?.kind === "team"
                              ? message.sender_id === viewer.id
                              : viewer?.kind === "admin" && message.sender_is_admin;
                          const inlineImage = isInlineImageBody(message.body);
                          const sticker = getSticker(message.sticker_key);
                          const reactionEntries = Object.entries(message.reactions || {}).filter(([, ids]) => ids.length > 0);
                          const swipeOffset = swipeHint?.id === message.id ? swipeHint.offset : 0;

                          return (
                            <li
                              key={message.id}
                              ref={(node) => {
                                messageRefs.current[message.id] = node;
                              }}
                              className={cn("flex gap-3 rounded-3xl transition-shadow", mine ? "flex-row-reverse" : "flex-row")}
                            >
                              {!mine && (
                                <div className="shrink-0 mt-1">
                                  {message.sender_avatar ? (
                                    <img src={message.sender_avatar} alt="" className="w-8 h-8 rounded-2xl object-cover shadow-sm" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-2xl bg-[#0A4FE8] text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                                      {message.sender_name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className={cn("max-w-[90%] sm:max-w-[75%] group flex flex-col", mine ? "items-end" : "items-start")}>
                                {!mine && (
                                  <p className={cn("text-[10.5px] font-semibold mb-1 px-1 flex items-center gap-1.5", currentTheme.dark ? "text-slate-400" : "text-gray-500")}>
                                    {message.sender_name}
                                    {message.sender_is_admin && (
                                      <span className="inline-block px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[8.5px] font-bold uppercase tracking-wider">
                                        Admin
                                      </span>
                                    )}
                                  </p>
                                )}

                                <ContextMenu>
                                  <ContextMenuTrigger asChild>
                                    <div
                                      className="relative"
                                      onTouchStart={(event) => handleTouchStart(message, event)}
                                      onTouchMove={(event) => handleTouchMove(message, event)}
                                      onTouchEnd={() => handleTouchEnd(message)}
                                      onTouchCancel={() => {
                                        touchStateRef.current = null;
                                        setSwipeHint(null);
                                      }}
                                    >
                                      {swipeOffset !== 0 && (
                                        <div
                                          className={cn(
                                            "absolute inset-y-0 flex items-center text-[10px] font-semibold uppercase tracking-[0.22em]",
                                            mine ? "-left-14 justify-start" : "-right-14 justify-end",
                                            currentTheme.dark ? "text-slate-300" : "text-slate-400",
                                          )}
                                        >
                                          <Reply className="w-3.5 h-3.5" />
                                        </div>
                                      )}

                                      <div className="transition-transform duration-150" style={{ transform: `translateX(${swipeOffset}px)` }}>
                                        <div
                                          className={cn(
                                            "rounded-[22px] px-4 py-3 text-[13px] leading-[1.6] shadow-lg border",
                                            mine ? "rounded-tr-md text-white border-transparent" : "rounded-tl-md",
                                          )}
                                          style={{
                                            background: mine ? currentTheme.mineBubble : currentTheme.otherBubble,
                                            borderColor: mine ? "transparent" : currentTheme.otherBorder,
                                            boxShadow: mine
                                              ? "0 16px 32px rgba(10,79,232,0.18)"
                                              : currentTheme.dark
                                              ? "0 16px 28px rgba(2,6,23,0.28)"
                                              : "0 16px 28px rgba(148,163,184,0.12)",
                                          }}
                                        >
                                          {message.reply_to && (
                                            <button
                                              onClick={() => scrollToMessage(message.reply_to!.id)}
                                              className={cn(
                                                "w-full text-left mb-2 rounded-2xl px-3 py-2 border",
                                                mine ? "bg-white/10 border-white/15" : "bg-slate-50/85 border-slate-200/80",
                                              )}
                                            >
                                              <p className={cn("text-[10px] font-semibold uppercase tracking-[0.2em]", mine ? "text-white/70" : "text-slate-500")}>
                                                Replying to {message.reply_to.sender_name}
                                              </p>
                                              <p className={cn("text-[11px] mt-1 line-clamp-2", mine ? "text-white/85" : "text-slate-600")}>
                                                {describeMessage(message.reply_to)}
                                              </p>
                                            </button>
                                          )}

                                          {message.forwarded && (
                                            <div
                                              className={cn(
                                                "text-[11px] mb-2 pl-3 border-l-2 flex items-start gap-1.5 italic",
                                                mine ? "border-white/40 text-white/80" : "border-[#0A4FE8]/20 text-slate-500",
                                              )}
                                            >
                                              <CornerDownRight className="w-3 h-3 shrink-0 mt-0.5" />
                                              <span>
                                                Forwarded from{" "}
                                                <span className="font-bold underline decoration-dotted underline-offset-2">{message.forwarded.original_sender_name}</span>
                                              </span>
                                            </div>
                                          )}

                                          {message.deleted_at ? (
                                            <div className={cn("italic flex items-center gap-2", mine ? "text-white/80" : currentTheme.dark ? "text-slate-300" : "text-slate-500")}>
                                              <Trash2 className="w-3.5 h-3.5" />
                                              Message deleted
                                            </div>
                                          ) : sticker ? (
                                            <div className="min-w-[150px]">
                                              <div className="rounded-[24px] p-4 text-center text-white shadow-lg" style={{ background: sticker.background }}>
                                                <div className="text-[40px] leading-none">{sticker.emoji}</div>
                                                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">{sticker.title}</p>
                                              </div>
                                            </div>
                                          ) : inlineImage && message.attachment_url ? (
                                            <a href={message.attachment_url} target="_blank" rel="noreferrer" className="block -m-1">
                                              <img
                                                src={message.attachment_url}
                                                alt={inlineImage[1]}
                                                className="max-h-72 max-w-full rounded-[18px] object-contain bg-black/5"
                                              />
                                            </a>
                                          ) : (
                                            <>
                                              <div className={cn("whitespace-pre-wrap break-words", mine ? "text-white" : currentTheme.dark ? "text-white" : "text-[#0D1B39]")}>
                                                <Linkified text={message.body || ""} />
                                              </div>
                                              {(() => {
                                                const linkUrl = firstUrl(message.body);
                                                if (!linkUrl) return null;
                                                return (
                                                  <LinkPreview
                                                    url={linkUrl}
                                                    variant={mine || currentTheme.dark ? "dark" : "light"}
                                                  />
                                                );
                                              })()}
                                              {!inlineImage && message.attachment_url && (() => {
                                                const ageMs = Date.now() - new Date(message.created_at).getTime();
                                                const expired = ageMs > 7 * 24 * 60 * 60 * 1000;
                                                return (
                                                  <div
                                                    className={cn(
                                                      "mt-3 rounded-2xl p-3 border flex items-center gap-3",
                                                      mine ? "bg-white/10 border-white/15" : currentTheme.dark ? "bg-slate-900/55" : "bg-slate-50/85",
                                                      expired && "opacity-60",
                                                    )}
                                                    style={{ borderColor: mine ? "rgba(255,255,255,0.14)" : currentTheme.otherBorder }}
                                                  >
                                                    <div
                                                      className={cn(
                                                        "w-10 h-10 rounded-2xl flex items-center justify-center",
                                                        mine ? "bg-white/15 text-white" : currentTheme.dark ? "bg-slate-800 text-white" : "bg-white text-[#0A4FE8]",
                                                      )}
                                                    >
                                                      {isInlineImageBody(message.body) ? <ImageIcon className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                      <p className={cn("text-[11px] font-semibold", mine ? "text-white" : currentTheme.dark ? "text-white" : "text-[#0D1B39]")}>
                                                        {expired ? "Attachment expired" : "Shared attachment"}
                                                      </p>
                                                      {expired ? (
                                                        <p className={cn("text-[10px] mt-0.5", mine ? "text-white/65" : currentTheme.dark ? "text-slate-400" : "text-slate-500")}>
                                                          Attachments stay available in chat for 7 days.
                                                        </p>
                                                      ) : (
                                                        <a
                                                          href={message.attachment_url}
                                                          target="_blank"
                                                          rel="noreferrer"
                                                          className={cn(
                                                            "text-[10px] mt-0.5 font-semibold uppercase tracking-[0.22em]",
                                                            mine ? "text-white/80" : currentTheme.dark ? "text-sky-300" : "text-[#0A4FE8]",
                                                          )}
                                                        >
                                                          Open attachment
                                                        </a>
                                                      )}
                                                    </div>
                                                  </div>
                                                );
                                              })()}
                                            </>
                                          )}

                                          <div className={cn("mt-2.5 flex items-center gap-2 text-[10px]", mine ? "justify-end text-white/70" : currentTheme.dark ? "text-slate-400" : "text-slate-400")}>
                                            {message.edited_at && !message.deleted_at && <span>edited</span>}
                                            <span>{formatClock(message.created_at)}</span>
                                          </div>
                                        </div>
                                      </div>

                                      <div className={cn("mt-1.5 flex items-center gap-1.5 px-1", mine ? "justify-end" : "justify-start")}>
                                        {reactionEntries.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5">
                                            {reactionEntries.map(([emoji, ids]) => {
                                              const active = viewer?.reactionKey ? ids.includes(viewer.reactionKey) : false;
                                              return (
                                                <button
                                                  key={emoji}
                                                  onClick={() => toggleReaction(message.id, emoji)}
                                                  className={cn(
                                                    "h-7 rounded-full px-2.5 text-[11px] font-medium inline-flex items-center gap-1 border transition",
                                                    active
                                                      ? "bg-blue-100 text-blue-700 border-blue-200"
                                                      : currentTheme.dark
                                                      ? "bg-slate-900/70 text-slate-200 border-slate-700"
                                                      : "bg-white/90 text-slate-600 border-slate-200",
                                                  )}
                                                >
                                                  <span className="text-sm leading-none">{emoji}</span>
                                                  <span>{ids.length}</span>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}

                                        <div className={cn("flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition", mine ? "justify-end" : "justify-start")}>
                                          <button
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setReactionPickerFor(reactionPickerFor === message.id ? null : message.id);
                                            }}
                                            className={cn(
                                              "w-8 h-8 rounded-full grid place-items-center border",
                                              currentTheme.dark
                                                ? "bg-slate-900/70 text-slate-200 border-slate-700"
                                                : "bg-white/90 text-slate-500 border-slate-200",
                                            )}
                                            title="React"
                                          >
                                            <SmilePlus className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={() => queueReply(message)}
                                            className={cn(
                                              "w-8 h-8 rounded-full grid place-items-center border",
                                              currentTheme.dark
                                                ? "bg-slate-900/70 text-slate-200 border-slate-700"
                                                : "bg-white/90 text-slate-500 border-slate-200",
                                            )}
                                            title="Reply"
                                          >
                                            <Reply className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={() => setActionMessage(message)}
                                            className={cn(
                                              "w-8 h-8 rounded-full grid place-items-center border",
                                              currentTheme.dark
                                                ? "bg-slate-900/70 text-slate-200 border-slate-700"
                                                : "bg-white/90 text-slate-500 border-slate-200",
                                            )}
                                            title="More actions"
                                          >
                                            <MoreHorizontal className="w-4 h-4" />
                                          </button>
                                        </div>

                                        {reactionPickerFor === message.id && (
                                          <div
                                            onClick={(event) => event.stopPropagation()}
                                            className={cn(
                                              "absolute z-30 -top-12 rounded-full px-2 py-1.5 flex items-center gap-0.5 shadow-2xl border",
                                              mine ? "right-0" : "left-0",
                                              currentTheme.dark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200",
                                            )}
                                          >
                                            {REACTION_EMOJIS.map((emoji) => (
                                              <button
                                                key={emoji}
                                                onClick={() => toggleReaction(message.id, emoji)}
                                                className="w-8 h-8 grid place-items-center text-lg hover:bg-black/5 rounded-full transition hover:scale-125"
                                              >
                                                {emoji}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </ContextMenuTrigger>
                                  <ContextMenuContent className="w-52">
                                    {message.reply_to && (
                                      <ContextMenuItem onClick={() => scrollToMessage(message.reply_to!.id)}>
                                        <CornerDownRight className="w-4 h-4 mr-2" /> View replied message
                                      </ContextMenuItem>
                                    )}
                                    <ContextMenuItem onClick={() => queueReply(message)}>
                                      <Reply className="w-4 h-4 mr-2" /> Reply
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => setReactionPickerFor(message.id)}>
                                      <SmilePlus className="w-4 h-4 mr-2" /> React
                                    </ContextMenuItem>
                                    {canEditMessage(message) && (
                                      <ContextMenuItem onClick={() => beginEdit(message)}>
                                        <Pencil className="w-4 h-4 mr-2" /> Edit
                                      </ContextMenuItem>
                                    )}
                                    <ContextMenuItem onClick={() => setForwarding(message)}>
                                      <Forward className="w-4 h-4 mr-2" /> Forward
                                    </ContextMenuItem>
                                    {canDeleteMessage(message) && (
                                      <>
                                        <ContextMenuSeparator />
                                        <ContextMenuItem onClick={() => deleteMessage(message.id)} className="text-rose-600 focus:text-rose-600">
                                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                                        </ContextMenuItem>
                                      </>
                                    )}
                                  </ContextMenuContent>
                                </ContextMenu>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {suggestions.length > 0 && (
              <div className="px-3 sm:px-5 py-2 flex flex-wrap gap-2 animate-in slide-in-from-bottom-2 duration-300" style={{ background: currentTheme.composer }}>
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setInput(suggestion.body);
                      setSuggestions([]);
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-white border border-blue-100 text-[11.5px] font-medium text-[#0A4FE8] shadow-xs hover:bg-blue-50 hover:border-blue-200 transition-all flex items-center gap-1.5"
                    title="Insert into message box"
                  >
                    <Wand2 className="w-3 h-3" />
                    {suggestion.label}
                  </button>
                ))}
                <button onClick={() => setSuggestions([])} className="p-1.5 text-gray-300 hover:text-gray-500">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {composerPanel && (
              <div
                className="border-t px-3 sm:px-4 py-3"
                style={{
                  background: currentTheme.composer,
                  borderColor: currentTheme.dark ? "rgba(71,85,105,0.54)" : "rgba(226,232,240,0.72)",
                }}
              >
                {composerPanel === "emoji" && (
                  <div className="space-y-3">
                    {EMOJI_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className={cn("text-[10px] font-semibold uppercase tracking-[0.24em] mb-2", currentTheme.dark ? "text-slate-400" : "text-slate-500")}>
                          {group.label}
                        </p>
                        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                          {group.items.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                setInput((prev) => `${prev}${emoji}`);
                                focusComposer();
                              }}
                              className={cn(
                                "h-11 rounded-2xl text-2xl grid place-items-center border",
                                currentTheme.dark ? "bg-slate-900/70 border-slate-700" : "bg-white/90 border-slate-200",
                              )}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {composerPanel === "stickers" && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {STICKERS.map((sticker) => (
                      <button
                        key={sticker.key}
                        onClick={() => sendMessage({ stickerKey: sticker.key })}
                        className="rounded-[24px] p-4 text-white text-left shadow-lg"
                        style={{ background: sticker.background }}
                      >
                        <div className="text-[34px] leading-none">{sticker.emoji}</div>
                        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80">{sticker.title}</p>
                      </button>
                    ))}
                  </div>
                )}

                {composerPanel === "background" && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(Object.entries(CHAT_BACKGROUNDS) as [ChatBackgroundKey, (typeof CHAT_BACKGROUNDS)[ChatBackgroundKey]][]).map(([key, background]) => (
                      <button
                        key={key}
                        onClick={() => setChatBackground(key)}
                        className={cn(
                          "rounded-[22px] border p-3 text-left transition",
                          chatBackground === key
                            ? currentTheme.dark
                              ? "border-sky-400"
                              : "border-blue-300"
                            : currentTheme.dark
                            ? "border-slate-700"
                            : "border-slate-200",
                        )}
                        style={{ background: background.canvas }}
                      >
                        <div className="h-16 rounded-[18px] border mb-3" style={{ background: background.shell, borderColor: "rgba(255,255,255,0.35)" }} />
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className={cn("text-[12px] font-semibold", currentTheme.dark ? "text-white" : "text-[#0D1B39]")}>{background.label}</p>
                            <p className={cn("text-[10px]", currentTheme.dark ? "text-slate-400" : "text-slate-500")}>Saved on this device</p>
                          </div>
                          {chatBackground === key && <CheckCheck className={cn("w-4 h-4", currentTheme.dark ? "text-sky-300" : "text-blue-600")} />}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              className="border-t p-3 sm:p-4 relative"
              style={{
                background: currentTheme.composer,
                borderColor: currentTheme.dark ? "rgba(71,85,105,0.54)" : "rgba(226,232,240,0.72)",
              }}
            >
              {suggestionsLoading && (
                <div className="absolute -top-8 left-3 sm:left-6 flex items-center gap-2 bg-white/80 backdrop-blur-md border border-blue-50 px-3 py-1 rounded-full shadow-xs">
                  <Loader2 className="w-3 h-3 animate-spin text-[#0A4FE8]" />
                  <span className="text-[10px] font-bold text-[#0A4FE8] uppercase tracking-widest">AI Thinking...</span>
                </div>
              )}

              {(replyingTo || editingMessageId) && (
                <div
                  className={cn(
                    "mb-3 rounded-[22px] border px-4 py-3 flex items-start justify-between gap-3",
                    currentTheme.dark ? "bg-slate-900/70 border-slate-700" : "bg-white/90 border-slate-200",
                  )}
                >
                  <div className="min-w-0">
                    <p className={cn("text-[10px] font-semibold uppercase tracking-[0.24em]", currentTheme.dark ? "text-sky-300" : "text-blue-600")}>
                      {editingMessageId ? "Editing message" : replyingTo ? `Replying to ${replyingTo.sender_name}` : ""}
                    </p>
                    <p className={cn("text-[12px] mt-1 truncate", currentTheme.dark ? "text-slate-300" : "text-slate-600")}>
                      {editingMessageId ? "Update your message and send to save the edit." : replyingTo ? describeMessage(replyingTo) : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (editingMessageId) setInput("");
                      resetComposerState();
                    }}
                    className={cn("p-1.5 rounded-full", currentTheme.dark ? "text-slate-400 hover:bg-slate-800" : "text-slate-400 hover:bg-slate-100")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2 sm:gap-3">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,.pdf" />

                {(viewer?.kind === "admin" || currentThread?.includes_admin) && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className={cn(
                      "p-3 rounded-2xl transition border",
                      currentTheme.dark
                        ? "text-slate-300 hover:text-white bg-slate-900/60 border-slate-700 hover:bg-slate-800"
                        : "text-gray-400 hover:text-[#0A4FE8] bg-white/88 border-slate-200 hover:border-blue-100",
                    )}
                    title="Upload image (≤5MB) or PDF (≤20MB)"
                  >
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                  </button>
                )}

                <div
                  className="flex-1 rounded-[28px] border shadow-lg"
                  style={{
                    background: currentTheme.dark ? "rgba(2,6,23,0.72)" : "rgba(255,255,255,0.92)",
                    borderColor: currentTheme.dark ? "rgba(71,85,105,0.58)" : "rgba(226,232,240,0.8)",
                  }}
                >
                  <div className="flex items-end gap-1 px-2 py-2">
                    <div className="flex items-center gap-1 pb-1 pl-1">
                      <button
                        onClick={() => setComposerPanel(composerPanel === "emoji" ? null : "emoji")}
                        className={cn(
                          "w-10 h-10 rounded-2xl grid place-items-center transition",
                          composerPanel === "emoji"
                            ? "bg-blue-600 text-white"
                            : currentTheme.dark
                            ? "text-slate-300 hover:bg-slate-800"
                            : "text-slate-500 hover:bg-slate-100",
                        )}
                        title="Emoji"
                      >
                        <SmilePlus className="w-4.5 h-4.5" />
                      </button>
                      <button
                        onClick={() => setComposerPanel(composerPanel === "stickers" ? null : "stickers")}
                        className={cn(
                          "w-10 h-10 rounded-2xl grid place-items-center transition",
                          composerPanel === "stickers"
                            ? "bg-blue-600 text-white"
                            : currentTheme.dark
                            ? "text-slate-300 hover:bg-slate-800"
                            : "text-slate-500 hover:bg-slate-100",
                        )}
                        title="Stickers"
                      >
                        <Shapes className="w-4.5 h-4.5" />
                      </button>
                    </div>

                    <div className="flex-1 relative flex items-end">
                      <textarea
                        ref={composerRef}
                        rows={1}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder={editingMessageId ? "Edit your message..." : "Type a message..."}
                        className={cn(
                          "w-full bg-transparent px-2 py-2.5 text-[13px] focus:outline-none resize-none overflow-y-auto",
                          currentTheme.dark ? "text-white placeholder:text-slate-500" : "text-[#0D1B39] placeholder:text-slate-400",
                        )}
                        style={{ lineHeight: "1.55", maxHeight: 156 }}
                      />

                      <div className="absolute right-1 bottom-2 flex items-center gap-1">
                        {input.trim() && (
                          <button
                            onClick={triggerAiRewrite}
                            disabled={aiLoading}
                            className={cn(
                              "p-2 rounded-xl transition",
                              currentTheme.dark ? "text-sky-300 hover:bg-slate-800" : "text-[#0A4FE8] hover:bg-blue-50",
                            )}
                            title="AI Refine (Smart Compose)"
                          >
                            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || sending}
                  className="shrink-0 w-12 h-12 flex items-center justify-center bg-[#0A4FE8] text-white rounded-2xl hover:bg-[#083EC0] transition shadow-[0_4px_12px_rgba(10,79,232,0.25)] disabled:opacity-50 disabled:shadow-none"
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : editingMessageId ? <Check className="w-5 h-5" /> : <Send className="w-5 h-5" />}
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
            await fetchMessages(true);
          }}
        />
      )}

      {actionMessage && (
        <MessageActionSheet
          message={actionMessage}
          canEdit={canEditMessage(actionMessage)}
          canDelete={canDeleteMessage(actionMessage)}
          theme={currentTheme}
          onClose={() => setActionMessage(null)}
          onReply={() => queueReply(actionMessage)}
          onEdit={() => beginEdit(actionMessage)}
          onDelete={() => deleteMessage(actionMessage.id)}
          onForward={() => {
            setForwarding(actionMessage);
            setActionMessage(null);
          }}
          onJumpToReply={
            actionMessage.reply_to
              ? () => {
                  scrollToMessage(actionMessage.reply_to!.id);
                  setActionMessage(null);
                }
              : undefined
          }
          onReact={(emoji) => toggleReaction(actionMessage.id, emoji)}
        />
      )}

      {showingNewChat && (
        <NewChatRoomDialog
          viewerKind={viewer?.kind || "team"}
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

function MessageActionSheet({
  message,
  canEdit,
  canDelete,
  theme,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onJumpToReply,
  onReact,
}: {
  message: Message;
  canEdit: boolean;
  canDelete: boolean;
  theme: (typeof CHAT_BACKGROUNDS)[ChatBackgroundKey];
  onClose: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onForward: () => void;
  onJumpToReply?: () => void;
  onReact: (emoji: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:hidden" onClick={onClose}>
      <div
        className="w-full rounded-t-[28px] border px-4 pt-3 pb-5 shadow-2xl"
        style={{
          background: theme.dark ? "rgba(2,6,23,0.96)" : "rgba(255,255,255,0.98)",
          borderColor: theme.dark ? "rgba(71,85,105,0.72)" : "rgba(226,232,240,0.8)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="w-12 h-1.5 rounded-full bg-slate-300/70 mx-auto mb-4" />
        <div className={cn("rounded-[22px] border px-4 py-3 mb-4", theme.dark ? "border-slate-700 bg-slate-900/70" : "border-slate-200 bg-slate-50/90")}>
          <p className={cn("text-[11px] font-semibold uppercase tracking-[0.24em]", theme.dark ? "text-slate-400" : "text-slate-500")}>
            Selected message
          </p>
          <p className={cn("text-[13px] mt-1 line-clamp-3", theme.dark ? "text-white" : "text-[#0D1B39]")}>{describeMessage(message)}</p>
        </div>

        <div className="flex items-center justify-between gap-2 mb-4">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              className={cn("flex-1 h-11 rounded-2xl text-xl border", theme.dark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200")}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {onJumpToReply && (
            <button onClick={onJumpToReply} className={cn("w-full rounded-2xl px-4 py-3 flex items-center gap-3", theme.dark ? "bg-slate-900 text-white" : "bg-slate-50 text-[#0D1B39]")}>
              <CornerDownRight className="w-4 h-4" /> View replied message
            </button>
          )}
          <button onClick={onReply} className={cn("w-full rounded-2xl px-4 py-3 flex items-center gap-3", theme.dark ? "bg-slate-900 text-white" : "bg-slate-50 text-[#0D1B39]")}>
            <Reply className="w-4 h-4" /> Reply
          </button>
          {canEdit && (
            <button onClick={onEdit} className={cn("w-full rounded-2xl px-4 py-3 flex items-center gap-3", theme.dark ? "bg-slate-900 text-white" : "bg-slate-50 text-[#0D1B39]")}>
              <Pencil className="w-4 h-4" /> Edit message
            </button>
          )}
          <button onClick={onForward} className={cn("w-full rounded-2xl px-4 py-3 flex items-center gap-3", theme.dark ? "bg-slate-900 text-white" : "bg-slate-50 text-[#0D1B39]")}>
            <Forward className="w-4 h-4" /> Forward
          </button>
          {canDelete && (
            <button onClick={onDelete} className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 bg-rose-50 text-rose-600">
              <Trash2 className="w-4 h-4" /> Delete message
            </button>
          )}
        </div>
      </div>
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
      const res = await fetch("/api/team/chat/threads", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.ok) setTeamThreads(json.threads || []);
    })();

    if (viewerKind === "admin") {
      (async () => {
        const res = await fetch("/api/chat/rooms", { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json.rooms) setClientRooms(json.rooms || []);
      })();
    }
  }, [viewerKind]);

  async function forward(targetKind: "team" | "client", targetId: string) {
    setForwarding(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "team",
          source_id: message.id,
          target: targetKind,
          target_id: targetId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) setError(json.error || "Couldn't forward that message");
      else onDone();
    } catch {
      setError("Network error");
    } finally {
      setForwarding(false);
    }
  }

  const teamFiltered = teamThreads.filter((thread) => (thread.name || "").toLowerCase().includes(search.toLowerCase()));
  const clientFiltered = clientRooms.filter((room) =>
    (room.client?.full_name || room.client?.email || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(event) => event.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-[#0D1B39]">Forward message</h3>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">Original: {message.body || "Attachment"}</p>
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
              onChange={(event) => setSearch(event.target.value)}
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
                  mode === "team" ? "bg-white text-[#0A4FE8] shadow-sm" : "text-gray-400 hover:text-gray-600",
                )}
              >
                Team Threads
              </button>
              <button
                onClick={() => setMode("client")}
                className={cn(
                  "flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition",
                  mode === "client" ? "bg-white text-[#0A4FE8] shadow-sm" : "text-gray-400 hover:text-gray-600",
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
              {teamFiltered.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => forward("team", thread.id)}
                  disabled={forwarding}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100/50 text-[#0A4FE8] flex items-center justify-center shrink-0">
                    {thread.kind === "department" ? <Hash className="w-4 h-4" /> : thread.kind === "group" ? <UsersIcon className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <span className="text-[13px] text-[#0D1B39] font-medium group-hover:text-[#0A4FE8] transition capitalize">
                    {thread.name || (thread.kind === "direct" ? "User" : "Untitled")}
                  </span>
                  {forwarding && <Loader2 className="w-3 h-3 animate-spin ml-auto text-blue-300" />}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {clientFiltered.length === 0 && <p className="p-8 text-center text-xs text-gray-400">No clients found</p>}
              {clientFiltered.map((room) => (
                <button
                  key={room.roomId}
                  onClick={() => forward("client", room.roomId)}
                  disabled={forwarding}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-emerald-50 transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-100/50 text-emerald-600 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-[13px] text-[#0D1B39] font-medium group-hover:text-emerald-600 transition truncate w-full">
                      {room.client?.full_name || room.client?.email || "Unknown Client"}
                    </span>
                    <span className="text-[10px] text-gray-400 truncate w-full">{room.client?.email}</span>
                  </div>
                  {forwarding && <Loader2 className="w-3 h-3 animate-spin ml-auto text-emerald-300" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <div className="px-5 py-3 border-t border-rose-50 bg-rose-50/50 text-rose-500 text-[11px] font-medium">{error}</div>}
      </div>
    </div>
  );
}

function NewChatRoomDialog({
  onClose,
  onCreated,
  viewerKind,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  viewerKind: "admin" | "team";
}) {
  const [loading, setLoading] = useState(false);
  const canCreateGroup = viewerKind === "admin";
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

  const filtered = members.filter((member) =>
    (member.full_name || member.username || "").toLowerCase().includes(search.toLowerCase()),
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
      if (json.ok) onCreated(json.thread_id);
      else setError(json.error || "Failed to create thread");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    if (kind === "direct") setSelectedIds([id]);
    else setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(event) => event.stopPropagation()}>
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
                kind === "direct" ? "bg-white text-[#0A4FE8] shadow-sm" : "text-gray-400 hover:text-gray-600",
              )}
            >
              Direct Message
            </button>
            {canCreateGroup && (
              <button
                onClick={() => setKind("group")}
                className={cn(
                  "flex-1 py-2.5 text-[12px] font-bold uppercase tracking-wider rounded-xl transition",
                  kind === "group" ? "bg-white text-[#0A4FE8] shadow-sm" : "text-gray-400 hover:text-gray-600",
                )}
              >
                Group Chat
              </button>
            )}
          </div>

          {kind === "group" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">Group Name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
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
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search team members..."
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-transparent rounded-xl text-[13px] focus:ring-2 focus:ring-blue-100 focus:bg-white focus:border-blue-200 transition"
              />
            </div>
            <div className="grid grid-cols-1 gap-1">
              {filtered.map((member) => (
                <button
                  key={member.id}
                  onClick={() => toggle(member.id)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition",
                    selectedIds.includes(member.id) ? "bg-blue-50 border-[#0A4FE8]/20" : "bg-white border-transparent hover:bg-gray-50",
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center font-bold text-xs uppercase">
                    {member.full_name?.charAt(0) || member.username.charAt(0)}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[13px] font-semibold text-[#0D1B39] truncate">{member.full_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">@{member.username}</p>
                  </div>
                  {selectedIds.includes(member.id) && (
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
