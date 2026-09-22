"use client";

/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { appPrompt, appConfirm, appAlert } from "@/lib/app-notify";
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
  Paperclip,
  MessageSquarePlus,
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
  Pin,
  Star,
  Bookmark,
  Languages,
  CalendarClock,
  FileStack,
  ClipboardList,
  Vote,
  ShieldCheck,
  BookOpenText,
  Mic2,
  AtSign,
  Clock3,
  Copy,
  Upload,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { validateChatUpload } from "@/lib/chat-upload-limits";
import { buildCMeetAutoJoinPath, buildCMeetPath } from "@/lib/cmeet-links";
import { isSocialEngagementPost } from "@/lib/chat-social-engagement";
import {
  Linkified,
  LinkPreview,
  firstUrl,
} from "@/components/chat/message-links";
import { ChatSidebarPreview } from "@/components/chat/chat-sidebar-preview";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { ViewportPortal } from "@/components/ui/ViewportPortal";
import {
  MeetingModeModal,
  type MeetingRequest,
} from "@/components/chat/MeetingModeModal";
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
  visibility?: "public" | "private" | "invite_only";
  description?: string | null;
  rules?: string | null;
  invite_code?: string | null;
  is_announcement_only?: boolean;
  is_voice_room?: boolean;
  is_voice_channel?: boolean;
  pinned_message_id?: string | null;
  project_id?: string | null;
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
  sender_role_title?: string | null;
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
  message_type?: string;
  metadata?: {
    custom_sticker?: CustomSticker;
    [key: string]: unknown;
  };
  delivery_status?: string;
  pinned_at?: string | null;
  pinned_by?: string | null;
  starred_by?: string[];
  bookmarked_by?: string[];
  scheduled_for?: string | null;
  translated?: Record<string, string>;
  audio_url?: string | null;
  audio_duration_seconds?: number | null;
  voice_transcript?: string | null;
  file_name?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
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
  roleTitle?: string | null;
  reactionKey: string;
  isManagement?: boolean;
  isSuperAdmin?: boolean;
}

interface ClientRoom {
  roomId: string;
  client: { id: string; email: string; full_name: string | null } | null;
  lastMessage: string;
}

interface ChatSearchResult {
  id: string;
  body?: string | null;
  file_name?: string | null;
  created_at: string;
}

interface ChatMemberOption {
  id: string;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  role_title?: string | null;
  department?: string | null;
  status?: "online" | "offline" | "break" | string;
}

interface PendingChatImage {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

interface CustomSticker {
  id: string;
  title: string;
  asset_url: string | null;
  emoji: string | null;
  background: string;
  mime_type: string | null;
  owner_key?: string;
  created_at?: string;
}

// Synthetic "@everyone" mention option - pings every member of the thread.
const EVERYONE_MENTION_ID = "__everyone__";
const EVERYONE_OPTION: ChatMemberOption = {
  id: EVERYONE_MENTION_ID,
  full_name: "Everyone",
  role_title: "Notify everyone in this chat",
};

interface ChatProjectOption {
  id: string;
  name: string;
  client?: string | null;
  status?: string | null;
}

type ComposerPanel = "emoji" | "stickers" | "background" | null;
type ChatBackgroundKey = "mist" | "linen" | "ocean" | "midnight";
type NewChatKind = "self" | "direct" | "group" | "department" | "project";

const CHAT_BG_KEY = "cds_team_chat_bg";
const SOCIAL_COMPLETION_REACTION = "__social_complete__";
const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "👏", "🔥", "🙏", "🎉"];
const EMOJI_GROUPS = [
  {
    label: "Popular",
    items: ["😀", "😂", "😍", "😭", "😮", "🙏", "👏", "🔥", "🎉", "❤️"],
  },
  {
    label: "Quick tone",
    items: ["👍", "👀", "✅", "💡", "🙌", "🤝", "💯", "😊", "😅", "🤔"],
  },
];
const STICKERS = [
  {
    key: "cheer-burst",
    emoji: "🎉",
    notoCode: "1f389",
    title: "Celebrate",
    background: "#B45309",
    motion: "cds-sticker-pop",
  },
  {
    key: "love-note",
    emoji: "💙",
    notoCode: "1f499",
    title: "Appreciate",
    background: "#0A4FE8",
    motion: "cds-sticker-pulse",
  },
  {
    key: "great-job",
    emoji: "👏",
    notoCode: "1f44f",
    title: "Great job",
    background: "#0E7490",
    motion: "cds-sticker-wiggle",
  },
  {
    key: "mind-blown",
    emoji: "🤯",
    notoCode: "1f92f",
    title: "Mind blown",
    background: "#BE123C",
    motion: "cds-sticker-pop",
  },
  {
    key: "ship-it",
    emoji: "🚀",
    notoCode: "1f680",
    title: "Ship it",
    background: "#0F766E",
    motion: "cds-sticker-float",
  },
  {
    key: "coffee-break",
    emoji: "☕",
    notoCode: "2615",
    title: "Coffee",
    background: "#78350F",
    motion: "cds-sticker-pulse",
  },
];

function animatedNotoStickerUrl(code: string) {
  return `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.webp`;
}
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
    label: "Quiet blue",
    shell: "#F7F9FC",
    canvas: "#EEF2F6",
    composer: "rgba(255,255,255,0.96)",
    mineBubble: "#0A4FE8",
    otherBubble: "#FFFFFF",
    otherBorder: "#E2E8F0",
    accent: "#0A4FE8",
    lightChip: "rgba(255,255,255,0.8)",
    dark: false,
  },
  linen: {
    label: "Soft linen",
    shell: "#FAF8F4",
    canvas: "#F3F0EA",
    composer: "rgba(255,255,255,0.96)",
    mineBubble: "#0A4FE8",
    otherBubble: "#FFFFFF",
    otherBorder: "#E8E1D6",
    accent: "#0A4FE8",
    lightChip: "rgba(255,255,255,0.78)",
    dark: false,
  },
  ocean: {
    label: "Soft ocean",
    shell: "#F3F8FA",
    canvas: "#EAF2F5",
    composer: "rgba(255,255,255,0.96)",
    mineBubble: "#0A4FE8",
    otherBubble: "#FFFFFF",
    otherBorder: "#D5E4EA",
    accent: "#0A4FE8",
    lightChip: "rgba(255,255,255,0.78)",
    dark: false,
  },
  midnight: {
    label: "Midnight",
    shell: "#111827",
    canvas: "#0F172A",
    composer: "rgba(15,23,42,0.96)",
    mineBubble: "#0A4FE8",
    otherBubble: "#182235",
    otherBorder: "#334155",
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
  message_type?: string | null;
}) {
  if (message.deleted_at) return "Message deleted";
  if (message.sticker_key) return "Sticker";
  const legacyImageMarker = isInlineImageBody(message.body || null);
  if (legacyImageMarker) return "Photo";
  if (message.message_type === "image") return message.body?.trim() || "Photo";
  if (message.attachment_url) return "Attachment";
  return message.body?.trim() || "Message";
}

function messageCopyText(message: Message) {
  if (message.deleted_at) return "Message deleted";
  const parts: string[] = [];
  if (message.forwarded?.original_body) {
    parts.push(
      `Forwarded from ${message.forwarded.original_sender_name}: ${message.forwarded.original_body}`,
    );
  }
  if (message.body && !isInlineImageBody(message.body)) parts.push(message.body);
  if (message.sticker_key && !message.body) {
    parts.push(
      getSticker(message.sticker_key)?.title ||
        message.metadata?.custom_sticker?.title ||
        "Sticker",
    );
  }
  if (message.attachment_url) parts.push(message.attachment_url);
  return parts.join("\n").trim() || describeMessage(message);
}

function formatDayDivider(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatClock(dateString: string) {
  return new Date(dateString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messageTime(m: { created_at: string }) {
  const t = Date.parse(m.created_at);
  return Number.isFinite(t) ? t : 0;
}

function sortByCreatedAt(a: Message, b: Message) {
  const diff = messageTime(a) - messageTime(b);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function optimisticSignature(m: {
  body?: string | null;
  sticker_key?: string | null;
  attachment_url?: string | null;
}) {
  return `${(m.body || "").trim()}|${m.sticker_key || ""}|${m.attachment_url || ""}`;
}

/**
 * Merge incremental sync results into the current list. Upserts by id, drops
 * optimistic `temp_` rows once their persisted server twin has arrived (covers
 * the race where delta sync delivers a just-sent message before the POST
 * response swaps the temp id), and keeps everything ordered by created_at.
 */
function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) {
    const existing = map.get(m.id);
    map.set(m.id, existing ? { ...existing, ...m } : m);
  }
  const all = Array.from(map.values());
  const reals = all.filter((m) => !m.id.startsWith("temp_"));
  const deduped = all.filter((m) => {
    if (!m.id.startsWith("temp_")) return true;
    return !reals.some(
      (r) =>
        r.sender_is_admin === m.sender_is_admin &&
        r.sender_id === m.sender_id &&
        optimisticSignature(r) === optimisticSignature(m) &&
        Math.abs(messageTime(r) - messageTime(m)) < 25000,
    );
  });
  return deduped.sort(sortByCreatedAt);
}

/** Shared team-chat UI. Same panel for admins and team members. */
export function TeamChatPanel({
  initialThreadId,
}: { initialThreadId?: string | null } = {}) {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<string | null>(
    initialThreadId ?? null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [viewer, setViewer] = useState<ViewerInfo | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState<"voice" | "video" | null>(null);
  // Pressing a call button asks how to meet; nothing is created until it is answered.
  const [meetingPrompt, setMeetingPrompt] = useState<"voice" | "video" | null>(
    null,
  );
  const [mobileShowThread, setMobileShowThread] = useState(!!initialThreadId);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [showingNewChat, setShowingNewChat] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<PendingChatImage | null>(
    null,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [customStickers, setCustomStickers] = useState<CustomSticker[]>([]);
  const [stickersLoading, setStickersLoading] = useState(false);
  const [stickerSaving, setStickerSaving] = useState(false);
  const [showStickerCreator, setShowStickerCreator] = useState(false);
  const [stickerEmoji, setStickerEmoji] = useState("🙂");
  const [stickerTitle, setStickerTitle] = useState("");
  const [composerPanel, setComposerPanel] = useState<ComposerPanel>(null);
  const [toolkitOpen, setToolkitOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(
    null,
  );
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [chatBackground, setChatBackground] =
    useState<ChatBackgroundKey>("mist");
  const [swipeHint, setSwipeHint] = useState<{
    id: string;
    offset: number;
  } | null>(null);
  // @-mention state: members of the current thread, the active query, and which
  // suggestion is highlighted. `mentionAnchor` is the index of the "@" that
  // started the token so we can replace it on select.
  const [mentionMembers, setMentionMembers] = useState<ChatMemberOption[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionAnchor, setMentionAnchor] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerFileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const syncBusyRef = useRef(false);
  const touchStateRef = useRef<{
    id: string;
    x: number;
    y: number;
    longPressId: number | null;
  } | null>(null);

  // --- Realtime delta-sync engine state ---------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | null>(null); // last change-sync cursor
  const atBottomRef = useRef(true); // is the viewport pinned to the latest message?
  const [atBottom, setAtBottom] = useState(true);
  const [jumpCount, setJumpCount] = useState(0); // new messages received while scrolled up
  const [typingUsers, setTypingUsers] = useState<
    { id: string; name: string }[]
  >([]);
  const [readWatermark, setReadWatermark] = useState<string | null>(null); // latest time another participant has read up to
  const [hasMore, setHasMore] = useState(false); // older history exists
  const hasMoreRef = useRef(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  // Refs mirror state so the [] -dependency sync callbacks never read stale values.
  const selectedThreadRef = useRef<string | null>(selectedThread);
  const viewerRef = useRef<ViewerInfo | null>(viewer);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    selectedThreadRef.current = selectedThread;
  }, [selectedThread]);
  useEffect(() => {
    viewerRef.current = viewer;
  }, [viewer]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const isOwnMessage = useCallback((m: Message) => {
    const v = viewerRef.current;
    if (!v) return false;
    return v.id
      ? m.sender_id === v.id && !m.sender_is_admin
      : !!v.isSuperAdmin && m.sender_is_admin;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setAtBottom(true);
    setJumpCount(0);
  }, []);

  const currentThread =
    threads.find((thread) => thread.id === selectedThread) || null;
  // Files/media are allowed in group spaces (department & project group chats)
  // and admin DMs, but blocked in 1-on-1 member chats. The server enforces the
  // same rule; this just hides the affordance.
  const attachmentsAllowed =
    !!currentThread &&
    !(currentThread.kind === "direct" && !currentThread.includes_admin);
  const currentTheme = CHAT_BACKGROUNDS[chatBackground];
  // Announcement channels are read-only for everyone except management.
  const composerLocked =
    !!currentThread?.is_announcement_only && !viewer?.isManagement;

  useEffect(() => {
    syncBusyRef.current = sending || uploading;
  }, [sending, uploading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(CHAT_BG_KEY);
    if (
      saved === "mist" ||
      saved === "linen" ||
      saved === "ocean" ||
      saved === "midnight"
    ) {
      setChatBackground(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CHAT_BG_KEY, chatBackground);
  }, [chatBackground]);

  const loadCustomStickers = useCallback(async () => {
    setStickersLoading(true);
    try {
      const response = await fetch("/api/team/chat/stickers", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not load stickers");
      }
      setCustomStickers(payload.stickers || []);
    } catch (error) {
      console.error(error);
    } finally {
      setStickersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (composerPanel === "stickers") void loadCustomStickers();
  }, [composerPanel, loadCustomStickers]);

  async function createEmojiSticker() {
    if (!stickerEmoji.trim() || stickerSaving) return;
    setStickerSaving(true);
    try {
      const response = await fetch("/api/team/chat/stickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emoji: stickerEmoji.trim(),
          title: stickerTitle.trim() || "Custom sticker",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Sticker could not be created");
      }
      setCustomStickers((current) => [payload.sticker, ...current]);
      setStickerTitle("");
      setShowStickerCreator(false);
    } catch (error) {
      await appAlert(
        error instanceof Error ? error.message : "Sticker could not be created",
      );
    } finally {
      setStickerSaving(false);
    }
  }

  async function uploadCustomSticker(file: File) {
    if (stickerSaving) return;
    setStickerSaving(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("title", file.name.replace(/\.[^.]+$/, "") || "Custom sticker");
      const response = await fetch("/api/team/chat/stickers", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Sticker could not be uploaded");
      }
      setCustomStickers((current) => [payload.sticker, ...current]);
    } catch (error) {
      await appAlert(
        error instanceof Error ? error.message : "Sticker could not be uploaded",
      );
    } finally {
      setStickerSaving(false);
      if (stickerFileInputRef.current) stickerFileInputRef.current.value = "";
    }
  }

  async function sendCustomSticker(sticker: CustomSticker) {
    await sendMessage({
      stickerKey: `custom:${sticker.id}`,
      attachmentUrl: sticker.asset_url,
      messageType: "sticker",
      mimeType: sticker.mime_type,
      metadata: { custom_sticker: sticker },
    });
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(messageCopyText(message));
    } catch {
      const field = document.createElement("textarea");
      field.value = messageCopyText(message);
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopiedMessageId(message.id);
    window.setTimeout(
      () =>
        setCopiedMessageId((current) =>
          current === message.id ? null : current,
        ),
      1600,
    );
  }

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

  // Initial thread load (or a hard reload): fetch the latest page, reset the
  // sync cursor, and pin to the newest message.
  const loadInitial = useCallback(
    async (threadId: string) => {
      setMessagesLoading(true);
      try {
        const res = await fetch(
          `/api/team/chat/messages?threadId=${threadId}&limit=50`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (json.ok && selectedThreadRef.current === threadId) {
          setMessages(json.messages);
          cursorRef.current = json.cursor || null;
          setHasMore(!!json.hasMore);
          setJumpCount(0);
          setTypingUsers(json.typing || []);
          setReadWatermark(json.read_watermark || null);
          if (json.viewer) setViewer(json.viewer);
          // Double rAF: wait for the new messages to actually paint before pinning
          // to the bottom, otherwise we'd scroll against a stale (empty) height.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => scrollToBottom("auto")),
          );
        }
      } catch {
        /* ignore */
      }
      setMessagesLoading(false);
    },
    [scrollToBottom],
  );

  const reloadCurrent = useCallback(() => {
    const threadId = selectedThreadRef.current;
    if (threadId) loadInitial(threadId);
  }, [loadInitial]);

  // Incremental sync: pull only what changed since the cursor and merge it in,
  // preserving scroll position. This is the polling replacement that makes the
  // chat feel live without re-rendering the whole thread.
  const syncDelta = useCallback(async () => {
    const threadId = selectedThreadRef.current;
    if (!threadId || !cursorRef.current) return;
    if (syncBusyRef.current) return; // don't clobber an in-flight send/upload
    try {
      const res = await fetch(
        `/api/team/chat/messages?threadId=${threadId}&since=${encodeURIComponent(cursorRef.current)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!json.ok || selectedThreadRef.current !== threadId) return;
      if (json.cursor) cursorRef.current = json.cursor;
      if (json.viewer) setViewer(json.viewer);
      // Presence updates land every tick, even when no new messages arrived.
      setTypingUsers(json.typing || []);
      setReadWatermark(json.read_watermark || null);
      const incoming: Message[] = json.messages || [];
      if (incoming.length === 0) return;

      const wasAtBottom = atBottomRef.current;
      setMessages((prev) => {
        const beforeIds = new Set(prev.map((m) => m.id));
        if (!wasAtBottom) {
          const freshFromOthers = incoming.filter(
            (m) => !beforeIds.has(m.id) && !isOwnMessage(m) && !m.deleted_at,
          ).length;
          if (freshFromOthers > 0) setJumpCount((c) => c + freshFromOthers);
        }
        return mergeMessages(prev, incoming);
      });
      if (wasAtBottom) requestAnimationFrame(() => scrollToBottom("smooth"));
    } catch {
      /* ignore */
    }
  }, [isOwnMessage, scrollToBottom]);

  // History pagination: fetch an older page when the user scrolls to the top,
  // then restore the scroll anchor so the viewport doesn't jump.
  const loadOlder = useCallback(async () => {
    const threadId = selectedThreadRef.current;
    if (!threadId || loadingOlderRef.current || !hasMoreRef.current) return;
    const oldest = messagesRef.current.find((m) => !m.id.startsWith("temp_"));
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight || 0;
    const prevTop = el?.scrollTop || 0;
    try {
      const res = await fetch(
        `/api/team/chat/messages?threadId=${threadId}&before=${encodeURIComponent(oldest.created_at)}&limit=40`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (json.ok && selectedThreadRef.current === threadId) {
        const older: Message[] = json.messages || [];
        setHasMore(!!json.hasMore && older.length > 0);
        if (older.length) {
          setMessages((prev) => mergeMessages(prev, older));
          requestAnimationFrame(() => {
            const node = scrollRef.current;
            if (node)
              node.scrollTop = prevTop + (node.scrollHeight - prevHeight);
          });
        }
      }
    } catch {
      /* ignore */
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = near;
    setAtBottom(near);
    if (near) setJumpCount((c) => (c > 0 ? 0 : c));
    if (el.scrollTop < 80 && hasMoreRef.current && !loadingOlderRef.current)
      loadOlder();
  }, [loadOlder]);

  const markThreadRead = useCallback(
    async (threadId: string) => {
      if (viewer?.kind !== "team") return;
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId ? { ...thread, unread_count: 0 } : thread,
        ),
      );
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

  useEffect(() => {
    fetchThreads();
  }, []);

  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      setPendingImage(null);
      cursorRef.current = null;
      setHasMore(false);
      setJumpCount(0);
      setTypingUsers([]);
      setReadWatermark(null);
      atBottomRef.current = true;
      setAtBottom(true);
      return;
    }
    setPendingImage(null);
    setTypingUsers([]);
    setReadWatermark(null);

    cursorRef.current = null;
    loadInitial(selectedThread);
    markThreadRead(selectedThread);

    // Fast incremental sync loop. Only new/changed rows come down each tick, so
    // this is cheap enough to run frequently - ~1.8s feels near-live.
    const interval = setInterval(() => {
      if (document.hidden) return; // pause when the tab is backgrounded
      syncDelta();
      if (atBottomRef.current) markThreadRead(selectedThread);
    }, 1800);

    // Catch up instantly when the tab regains focus.
    const onVisible = () => {
      if (!document.hidden) syncDelta();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selectedThread, loadInitial, syncDelta, markThreadRead]);

  useEffect(() => {
    if (!composerRef.current) return;
    composerRef.current.style.height = "0px";
    composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 156)}px`;
  }, [input, editingMessageId]);

  // Load the members of the selected thread so "@" can suggest them. Scoped to
  // the thread's participants server-side.
  useEffect(() => {
    if (!selectedThread) {
      setMentionMembers([]);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/team/chat/members?threadId=${encodeURIComponent(selectedThread)}`,
      { credentials: "include" },
    )
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.ok) setMentionMembers(json.members || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedThread]);

  // Close the mention menu whenever the composer is cleared (e.g. after send).
  useEffect(() => {
    if (!input) {
      setMentionQuery(null);
      setMentionAnchor(null);
    }
  }, [input]);

  // Members matching the active "@" token (or all when the token is empty).
  const mentionMatches = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    const members = mentionMembers
      .filter((m) => {
        if (!q) return true;
        return [m.full_name, m.username].some((v) =>
          (v || "").toLowerCase().includes(q),
        );
      })
      .slice(0, 8);
    // Offer @everyone when the query is empty or looks like "everyone"/"all".
    const showEveryone = !q || "everyone".startsWith(q) || "all".startsWith(q);
    return showEveryone ? [EVERYONE_OPTION, ...members] : members;
  }, [mentionQuery, mentionMembers]);

  const mentionActive = mentionQuery != null && mentionMatches.length > 0;

  // Re-derive the @-token from the caret position after every edit.
  const detectMention = (value: string, caret: number) => {
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    // Valid trigger: "@" at start or right after whitespace, with no space/
    // newline between it and the caret.
    if (at === -1 || (at > 0 && !/\s/.test(value[at - 1]))) {
      setMentionQuery(null);
      setMentionAnchor(null);
      return;
    }
    const token = upto.slice(at + 1);
    if (/\s/.test(token)) {
      setMentionQuery(null);
      setMentionAnchor(null);
      return;
    }
    setMentionAnchor(at);
    setMentionQuery(token);
    setMentionIndex(0);
  };

  const onComposerChange = (value: string, caret: number) => {
    setInput(value);
    detectMention(value, caret);
  };

  // Replace the "@token" with "@Full Name " and drop the menu.
  const insertMention = (member: ChatMemberOption) => {
    if (mentionAnchor == null) return;
    const el = composerRef.current;
    const caret = el ? el.selectionStart : input.length;
    const label =
      member.id === EVERYONE_MENTION_ID
        ? "everyone"
        : (member.full_name || member.username || "member").trim();
    const before = input.slice(0, mentionAnchor);
    const after = input.slice(caret);
    const next = `${before}@${label} ${after}`;
    setInput(next);
    setMentionQuery(null);
    setMentionAnchor(null);
    const pos = before.length + label.length + 2; // "@" + label + trailing space
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  useEffect(() => {
    if (!selectedThread || !input.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/team/chat/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selectedThread, typing: true }),
        signal: controller.signal,
      }).catch(() => {});
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [input, selectedThread]);

  useEffect(() => {
    if (!reactionPickerFor) return;
    const close = () => setReactionPickerFor(null);
    const timer = window.setTimeout(
      () => document.addEventListener("click", close),
      0,
    );
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", close);
    };
  }, [reactionPickerFor]);

  function threadIcon(thread: Thread) {
    if (thread.kind === "department") return <Hash className="w-3.5 h-3.5" />;
    if (thread.kind === "admin_broadcast")
      return <Megaphone className="w-3.5 h-3.5" />;
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
    window.setTimeout(
      () => node.classList.remove("ring-2", "ring-blue-200"),
      1200,
    );
  }

  function queueReply(message: Message) {
    setReplyingTo(message);
    setEditingMessageId(null);
    setActionMessage(null);
    setComposerPanel(null);
    focusComposer();
  }

  function beginEdit(message: Message) {
    if (
      !message.body ||
      message.deleted_at ||
      message.sticker_key ||
      (!message.body && message.attachment_url)
    )
      return;
    setEditingMessageId(message.id);
    setPendingImage(null);
    setReplyingTo(null);
    setInput(message.body);
    setActionMessage(null);
    setComposerPanel(null);
    focusComposer();
  }

  function updateMessageLocally(nextMessage: Message) {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === nextMessage.id ? nextMessage : message,
      ),
    );
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
      if (!res.ok || !json.ok)
        throw new Error(json.error || "Failed to edit message");
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
    messageType,
    fileName,
    fileSizeBytes,
    mimeType,
    metadata,
  }: {
    body?: string | null;
    attachmentUrl?: string | null;
    stickerKey?: string | null;
    messageType?: string | null;
    fileName?: string | null;
    fileSizeBytes?: number | null;
    mimeType?: string | null;
    metadata?: Record<string, unknown>;
  } = {}) {
    if (!selectedThread || sending) return;
    if (composerLocked) return; // announcement channel: only management can post
    if (
      editingMessageId &&
      body === undefined &&
      !attachmentUrl &&
      !stickerKey
    ) {
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
      sender_id: viewer?.id || null,
      sender_is_admin: !!viewer?.isSuperAdmin,
      sender_name:
        viewer?.displayName || (viewer?.isSuperAdmin ? "Super admin" : "You"),
      sender_role_title: viewer?.roleTitle || null,
      sender_avatar: null,
      body: normalizedBody || null,
      attachment_url: attachmentUrl || null,
      forwarded: null,
      reply_to_message_id: replyTarget?.id || null,
      sticker_key: stickerKey || null,
      message_type: messageType || (attachmentUrl ? "file" : "text"),
      file_name: fileName || null,
      file_size_bytes: fileSizeBytes || null,
      mime_type: mimeType || null,
      metadata: (metadata || {}) as Message["metadata"],
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
    resetComposerState();
    requestAnimationFrame(() => scrollToBottom("smooth"));

    try {
      const res = await fetch("/api/team/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: selectedThread,
          body: normalizedBody || null,
          attachmentUrl: attachmentUrl || null,
          stickerKey: stickerKey || null,
          messageType: messageType || null,
          fileName: fileName || null,
          fileSizeBytes: fileSizeBytes || null,
          mimeType: mimeType || null,
          metadata: metadata || {},
          replyToMessageId: replyTarget?.id || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok)
        throw new Error(json.error || "Failed to send message");
      // Swap the optimistic row for the persisted one via merge so a delta tick
      // that already delivered this message can't leave a duplicate behind.
      setMessages((prev) =>
        mergeMessages(
          prev.filter((m) => m.id !== tempId),
          [json.message],
        ),
      );
      if (messageType === "image") setPendingImage(null);
      await fetchThreads();
    } catch (error) {
      console.error(error);
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      if (!stickerKey && (!attachmentUrl || messageType === "image"))
        setInput(normalizedBody);
    } finally {
      setSending(false);
    }
  }

  const meetingTitleFor = (kind: "voice" | "video") =>
    `${kind === "voice" ? "Voice" : "Video"} call - ${currentThread ? threadLabel(currentThread) : "team"}`;

  /** Every call button lands here, and the choice comes before the room. */
  function startCall(kind: "voice" | "video") {
    if (!currentThread || starting) return;
    setMeetingPrompt(kind);
  }

  /**
   * Creates what was asked for. A scheduled meeting posts its invite into the
   * conversation and stops; only an instant one opens the room.
   */
  async function createMeeting(
    kind: "voice" | "video",
    request: MeetingRequest,
  ) {
    if (!currentThread || starting) return;
    setStarting(kind);
    try {
      const title = request.title;
      const res = await fetch("/api/cmeet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          audio_only: request.audioOnly,
          scheduled_for: request.scheduledFor,
          agenda_items: request.agendaItems,
          source_thread_id: currentThread.id,
        }),
      });
      const json = await res.json();
      const roomCode = json?.meeting?.room_code;
      if (!res.ok || !json.ok || !roomCode)
        throw new Error(json.error || "Couldn't start call");
      // The title-aware /meet/<code>/<topic> route is the actual cMeet
      // pre-meeting page. Code-only links remain valid for older messages.
      // the user for a display name, shows the camera/mic preview, then
      // transitions into the live room. /team/cmeet/<code> was wrong.
      const link = `${window.location.origin}${buildCMeetPath(roomCode, title)}`;
      const when = request.scheduledFor
        ? new Date(request.scheduledFor).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "";
      const needsApproval = Boolean(json.requires_approval);
      await sendMessage({
        body: request.scheduledFor
          ? `${kind === "voice" ? "📞" : "🎥"} ${title} requested for ${when}${needsApproval ? " and is waiting for admin approval" : ""} - join: ${link}`
          : kind === "voice"
            ? `📞 Voice meeting ${needsApproval ? "requested and waiting for admin approval" : "started"} - join: ${link}`
            : `🎥 Video meeting ${needsApproval ? "requested and waiting for admin approval" : "started"} - join: ${link}`,
      });
      setMeetingPrompt(null);
      if (needsApproval) await appAlert("Your cMeet request was sent. An admin must approve it before the call can start.");
      else if (!request.scheduledFor) router.push(buildCMeetAutoJoinPath(link));
    } catch (error) {
      console.error(error);
    } finally {
      setStarting(null);
    }
  }

  async function uploadChatFile(
    file: File,
    preferredDisplayMode?: "inline" | "file",
    stageForCaption = false,
  ) {
    if (!selectedThread) return;

    const isImage = file.type.startsWith("image/");

    // Direct member chats accept photos, but keep larger business files and
    // videos in department/project spaces where their access is easier to
    // manage. The server mirrors this rule.
    if (!attachmentsAllowed && !isImage) {
      appAlert(
        "Documents and videos belong in a department or project group chat. You can still paste a photo here.",
      );
      return;
    }

    const isVideo = file.type.startsWith("video/");
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    const isDoc =
      /\.(docx?|pptx?|xlsx?|txt|csv)$/i.test(file.name) ||
      file.type.includes("officedocument") ||
      file.type.includes("msword");
    if (!isImage && !isVideo && !isPdf && !isDoc) {
      appAlert(
        "Unsupported file type. You can share images, videos, PDFs and documents.",
      );
      return;
    }

    // Size policy: images 6MB, videos 50MB. Bigger files should go to Google
    // Drive (the message says so). Mirrors the server-side enforcement.
    const sizeCheck = validateChatUpload(file.size, file.type || "");
    if (!sizeCheck.ok) {
      appAlert(sizeCheck.error || "File too large.");
      return;
    }

    let displayMode: "inline" | "file" = preferredDisplayMode || "file";
    if (isImage && !preferredDisplayMode) {
      const asInline = await appConfirm({
        title: "Send image",
        message:
          "Show this image inline in the chat, or send it as a file attachment?",
        confirmLabel: "Display inline",
        cancelLabel: "Send as file",
      });
      displayMode = asInline ? "inline" : "file";
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("threadId", selectedThread);

      const res = await fetch("/api/team/chat/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");

      if (stageForCaption && isImage) {
        setPendingImage({
          url: json.publicUrl,
          name: file.name || "Pasted photo",
          mimeType: file.type || "image/jpeg",
          size: file.size,
        });
        focusComposer();
        return;
      }

      const body =
        displayMode === "inline"
          ? `[[image:${file.name}]]`
          : `Sent an attachment: ${file.name}`;
      await sendMessage({
        body,
        attachmentUrl: json.publicUrl,
        messageType: displayMode === "inline" ? "image" : "file",
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type || null,
      });
      await fetchThreads();
    } catch (error) {
      console.error("Upload error:", error);
      appAlert("Failed to upload file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await uploadChatFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleComposerPaste(
    event: React.ClipboardEvent<HTMLTextAreaElement>,
  ) {
    if (composerLocked || uploading || sending) return;
    const photos = Array.from(event.clipboardData.items)
      .filter(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      )
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (photos.length === 0) return;
    event.preventDefault();
    if (pendingImage) {
      void appAlert("Send or remove the current photo before pasting another one.");
      return;
    }
    void uploadChatFile(photos[0], "inline", true);
  }

  async function submitComposer() {
    if (pendingImage) {
      const photo = pendingImage;
      await sendMessage({
        body: input.trim() || null,
        attachmentUrl: photo.url,
        messageType: "image",
        fileName: photo.name,
        fileSizeBytes: photo.size,
        mimeType: photo.mimeType,
      });
      return;
    }
    await sendMessage();
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
      reloadCurrent();
    }
  }

  async function runMessageAction(
    message: Message,
    action:
      | "pin"
      | "unpin"
      | "star"
      | "unstar"
      | "bookmark"
      | "unbookmark"
      | "translate",
  ) {
    if (message.id.startsWith("temp_")) return;
    try {
      const payload: Record<string, unknown> = { action };
      if (action === "translate") {
        const language = await appPrompt({
          title: "Translate message",
          message: "Translate this message to which language?",
          defaultValue: "English",
        });
        if (!language?.trim()) return;
        payload.language = language.trim();
      }
      const res = await fetch(`/api/team/chat/messages/${message.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok)
        throw new Error(json.error || "Message action failed");
      if (json.message) updateMessageLocally(json.message);
      setActionMessage(null);
      await fetchThreads();
    } catch (error) {
      console.error(error);
    } finally {
      /* action state is reflected by the updated message payload */
    }
  }

  async function runChatSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery.trim(),
        scope: "team",
      });
      if (selectedThread) params.set("threadId", selectedThread);
      const res = await fetch(`/api/team/chat/search?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      setSearchResults(json.ok ? json.results || [] : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function deleteMessage(messageId: string) {
    try {
      const res = await fetch(`/api/team/chat/messages/${messageId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.ok)
        throw new Error(json.error || "Failed to delete message");
      if (json.hardDeleted) setMessages((prev) => prev.filter((message) => message.id !== messageId));
      else updateMessageLocally(json.message);
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
    if (viewer?.isSuperAdmin)
      return message.sender_is_admin && !message.sticker_key && !!message.body;
    return (
      message.sender_id === viewer?.id &&
      !message.sender_is_admin &&
      !message.sticker_key &&
      !!message.body
    );
  }

  function canDeleteMessage(message: Message) {
    if (message.deleted_at) return false;
    if (viewer?.isSuperAdmin) return true;
    return message.sender_id === viewer?.id && !message.sender_is_admin;
  }

  function handleTouchStart(
    message: Message,
    event: React.TouchEvent<HTMLDivElement>,
  ) {
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

  function handleTouchMove(
    message: Message,
    event: React.TouchEvent<HTMLDivElement>,
  ) {
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
      setSwipeHint({
        id: message.id,
        offset: Math.max(-64, Math.min(64, deltaX)),
      });
    }
  }

  function handleTouchEnd(message: Message) {
    const state = touchStateRef.current;
    if (!state || state.id !== message.id) {
      setSwipeHint(null);
      return;
    }
    if (state.longPressId) window.clearTimeout(state.longPressId);
    if (
      swipeHint &&
      swipeHint.id === message.id &&
      Math.abs(swipeHint.offset) > 52
    ) {
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
      className="flex h-full min-h-0 w-full overflow-hidden rounded-2xl border shadow-sm sm:rounded-[24px]"
      style={{
        background: currentTheme.shell,
        borderColor: currentTheme.dark
          ? "rgba(71,85,105,0.64)"
          : "rgba(226,232,240,0.8)",
      }}
    >
      <aside
        className={cn(
          "w-full md:w-[320px] shrink-0 border-r flex flex-col backdrop-blur-xl",
          mobileShowThread && "hidden md:flex",
        )}
        style={{
          background: currentTheme.dark
            ? "rgba(2,6,23,0.84)"
            : "rgba(255,255,255,0.82)",
          borderColor: currentTheme.dark
            ? "rgba(71,85,105,0.58)"
            : "rgba(226,232,240,0.72)",
        }}
      >
        <div
          className="px-4 sm:px-5 py-4 border-b flex items-center justify-between"
          style={{
            borderColor: currentTheme.dark
              ? "rgba(71,85,105,0.48)"
              : "rgba(226,232,240,0.72)",
          }}
        >
          <div>
            <h2
              className={cn(
                "text-[15px] font-semibold",
                currentTheme.dark ? "text-white" : "text-[#0D1B39]",
              )}
            >
              Team chat
            </h2>
            <p
              className={cn(
                "text-[11.5px]",
                currentTheme.dark ? "text-slate-400" : "text-gray-400",
              )}
            >
              {viewer?.isSuperAdmin
                ? "All threads + broadcasts"
                : "Your channels, DMs, and broadcasts"}
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
            <p
              className={cn(
                "px-5 py-10 text-center text-[12px]",
                currentTheme.dark ? "text-slate-400" : "text-gray-400",
              )}
            >
              No threads yet.
            </p>
          ) : (
            <ul className="py-2">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    onClick={() => {
                      setSelectedThread(thread.id);
                      setMobileShowThread(true);
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
                        thread.kind === "admin_broadcast"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-[#0A4FE8]/10 text-[#0A4FE8]",
                      )}
                    >
                      {threadIcon(thread)}
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center justify-between gap-2 overflow-hidden">
                        <span
                          className={cn(
                            "text-[13px] font-semibold truncate",
                            currentTheme.dark ? "text-white" : "text-[#0D1B39]",
                          )}
                        >
                          {threadLabel(thread)}
                        </span>
                        {thread.unread_count > 0 && (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#0A4FE8] text-white text-[9px] font-bold flex items-center justify-center">
                            {thread.unread_count}
                          </span>
                        )}
                      </div>
                      <ChatSidebarPreview
                        text={
                          thread.last_message_preview ||
                          (thread.last_message
                            ? describeMessage(thread.last_message)
                            : null)
                        }
                        className={cn(
                          "mt-0.5 h-4 text-[12px]",
                          currentTheme.dark
                            ? "text-slate-400"
                            : "text-gray-400",
                        )}
                      />
                    </div>
                    {selectedThread === thread.id && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-lg"
                        style={{ background: currentTheme.accent }}
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section
        className={cn(
          "flex-1 flex flex-col min-w-0",
          !mobileShowThread && "hidden md:flex",
        )}
      >
        {!selectedThread ? (
          <div
            className="flex-1 flex flex-col items-center justify-center text-center p-8"
            style={{ background: currentTheme.canvas }}
          >
            <div className="w-16 h-16 rounded-3xl bg-[#0A4FE8]/5 text-[#0A4FE8] flex items-center justify-center mb-4">
              <MessageSquarePlus className="w-8 h-8" />
            </div>
            <h3
              className={cn(
                "text-[16px] font-semibold",
                currentTheme.dark ? "text-white" : "text-[#0D1B39]",
              )}
            >
              Select a conversation
            </h3>
            <p
              className={cn(
                "text-[13px] max-w-[280px] mt-1.5",
                currentTheme.dark ? "text-slate-400" : "text-gray-500",
              )}
            >
              Pick a thread from the sidebar or start a new conversation with
              your team.
            </p>
          </div>
        ) : (
          <>
            <header
              className="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-3 backdrop-blur-xl z-10"
              style={{
                background: currentTheme.composer,
                borderColor: currentTheme.dark
                  ? "rgba(71,85,105,0.54)"
                  : "rgba(226,232,240,0.72)",
              }}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <button
                  onClick={() => setMobileShowThread(false)}
                  className={cn(
                    "md:hidden p-1.5 -ml-1",
                    currentTheme.dark
                      ? "text-slate-400 hover:text-white"
                      : "text-gray-400 hover:text-[#0D1B39]",
                  )}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-xl bg-[#0A4FE8]/5 text-[#0A4FE8] flex items-center justify-center shrink-0">
                  {currentThread ? (
                    threadIcon(currentThread)
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    className={cn(
                      "text-[15px] font-bold truncate",
                      currentTheme.dark ? "text-white" : "text-[#0D1B39]",
                    )}
                  >
                    {currentThread ? threadLabel(currentThread) : "Chat"}
                  </h2>
                  <p
                    className={cn(
                      "text-[11.5px] truncate",
                      currentTheme.dark ? "text-slate-400" : "text-gray-400",
                    )}
                  >
                    {currentThread?.kind === "department" &&
                      `Department: ${currentThread.department}`}
                    {currentThread?.kind === "admin_broadcast" &&
                      "Company-wide broadcast"}
                    {currentThread?.kind === "group" && "Team Group"}
                    {currentThread?.kind === "direct" && "Direct message"}
                  </p>
                </div>
              </div>

              {currentThread && (
                <div className="flex items-center gap-1 shrink-0">
                  {viewer?.kind === "team" &&
                    currentThread.kind === "department" &&
                    currentThread.department && (
                      <Link
                        href={`/team/compliance?department=${encodeURIComponent(currentThread.department)}`}
                        className={cn(
                          "mr-1 inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition",
                          currentTheme.dark
                            ? "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-blue-500 hover:text-white"
                            : "border-blue-100 bg-blue-50 text-[#0A4FE8] hover:border-blue-200 hover:bg-blue-100",
                        )}
                        title={`Open ${currentThread.department} SOPs`}
                      >
                        <BookOpenText className="h-4 w-4" />
                        SOP
                      </Link>
                    )}
                  <button
                    onClick={() => setToolkitOpen((open) => !open)}
                    className={cn(
                      "p-2 rounded-xl transition",
                      toolkitOpen
                        ? "bg-blue-600 text-white"
                        : currentTheme.dark
                          ? "text-slate-300 hover:text-white hover:bg-slate-800/70"
                          : "text-gray-500 hover:text-[#0A4FE8] hover:bg-blue-50",
                    )}
                    title="Advanced chat tools"
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      setComposerPanel(
                        composerPanel === "background" ? null : "background",
                      )
                    }
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
                      {starting === "voice" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Phone className="w-4 h-4" />
                      )}
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
                      {starting === "video" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Video className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </header>

            {toolkitOpen && currentThread && (
              <AdvancedChatToolkit
                thread={currentThread}
                theme={currentTheme}
                query={searchQuery}
                results={searchResults}
                searching={searching}
                onQueryChange={setSearchQuery}
                onSearch={runChatSearch}
                onJump={(messageId) => {
                  scrollToMessage(messageId);
                  setToolkitOpen(false);
                }}
                onStartCall={startCall}
                onUpload={
                  attachmentsAllowed
                    ? () => fileInputRef.current?.click()
                    : undefined
                }
                viewer={viewer}
                onNewChat={() => setShowingNewChat(true)}
                onThreadUpdated={fetchThreads}
              />
            )}

            <div className="relative flex-1 flex flex-col min-h-0">
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-3 sm:px-5 py-5 sm:py-6 relative"
                style={{ background: currentTheme.canvas }}
              >
                {loadingOlder && (
                  <div className="flex justify-center pb-3">
                    <Loader2 className="w-4 h-4 animate-spin text-[#0A4FE8]" />
                  </div>
                )}
                {messagesLoading && messages.length === 0 ? (
                  <div className="flex justify-center pt-10">
                    <Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center pt-20 text-center opacity-60">
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                      <MessageSquarePlus className="w-6 h-6 text-gray-400" />
                    </div>
                    <p
                      className={cn(
                        "text-sm",
                        currentTheme.dark ? "text-slate-400" : "text-gray-400",
                      )}
                    >
                      Say hello and start the conversation.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupedMessages.map((group) => (
                      <div key={group.label} className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-px flex-1",
                              currentTheme.dark
                                ? "bg-slate-700/70"
                                : "bg-slate-200/80",
                            )}
                          />
                          <span
                            className={cn(
                              "px-3 py-1 rounded-full text-[10px] font-medium",
                              currentTheme.dark
                                ? "text-slate-300"
                                : "text-slate-500",
                            )}
                            style={{ background: currentTheme.lightChip }}
                          >
                            {group.label}
                          </span>
                          <div
                            className={cn(
                              "h-px flex-1",
                              currentTheme.dark
                                ? "bg-slate-700/70"
                                : "bg-slate-200/80",
                            )}
                          />
                        </div>

                        <ul className="space-y-2.5">
                          {group.items.map((message) => {
                            const mine = viewer?.id
                              ? message.sender_id === viewer.id && !message.sender_is_admin
                              : !!viewer?.isSuperAdmin && message.sender_is_admin;
                            const inlineImageMarker = isInlineImageBody(
                              message.body,
                            );
                            const inlineImage =
                              message.message_type === "image" ||
                              Boolean(inlineImageMarker);
                            const sticker = getSticker(message.sticker_key);
                            const customStickerId = message.sticker_key?.startsWith(
                              "custom:",
                            )
                              ? message.sticker_key.slice("custom:".length)
                              : null;
                            const customSticker =
                              message.metadata?.custom_sticker ||
                              customStickers.find(
                                (item) => item.id === customStickerId,
                              ) ||
                              null;
                            const isStickerMessage = Boolean(sticker || customSticker);
                            const socialEngagement = isSocialEngagementPost(
                              message.body,
                            );
                            const completionIds =
                              message.reactions?.[
                                SOCIAL_COMPLETION_REACTION
                              ] || [];
                            const completedByMe = viewer?.reactionKey
                              ? completionIds.includes(viewer.reactionKey)
                              : false;
                            const eligibleTeamMembers =
                              mentionMembers.filter(
                                (member) =>
                                  member.id !== "admin" &&
                                  member.id !== EVERYONE_MENTION_ID,
                              ).length + (viewer?.kind === "team" ? 1 : 0);
                            const completionTotal = Math.max(
                              eligibleTeamMembers,
                              completionIds.length,
                            );
                            const reactionEntries = Object.entries(
                              message.reactions || {},
                            ).filter(
                              ([emoji, ids]) =>
                                emoji !== SOCIAL_COMPLETION_REACTION &&
                                ids.length > 0,
                            );
                            const swipeOffset =
                              swipeHint?.id === message.id
                                ? swipeHint.offset
                                : 0;
                            const starredByMe =
                              !!viewer?.reactionKey &&
                              (message.starred_by || []).includes(
                                viewer.reactionKey,
                              );
                            const bookmarkedByMe =
                              !!viewer?.reactionKey &&
                              (message.bookmarked_by || []).includes(
                                viewer.reactionKey,
                              );
                            const translatedEntries = Object.entries(
                              message.translated || {},
                            );

                            return (
                              <li
                                key={message.id}
                                ref={(node) => {
                                  messageRefs.current[message.id] = node;
                                }}
                                className={cn(
                                  "flex gap-2.5 transition-shadow",
                                  mine ? "flex-row-reverse" : "flex-row",
                                )}
                              >
                                {!mine && (
                                  <div className="shrink-0 mt-1">
                                    <div className="w-8 h-8 rounded-full bg-[#0A4FE8] text-white text-[11px] font-semibold flex items-center justify-center">
                                      {initials(message.sender_name)}
                                    </div>
                                  </div>
                                )}

                                <div
                                  className={cn(
                                    "max-w-[90%] sm:max-w-[75%] group flex flex-col",
                                    mine ? "items-end" : "items-start",
                                  )}
                                >
                                  {!mine && (
                                    <p
                                      className={cn(
                                        "text-[10.5px] font-semibold mb-1 px-1 flex items-center gap-1.5",
                                        currentTheme.dark
                                          ? "text-slate-400"
                                          : "text-gray-500",
                                      )}
                                    >
                                      {message.sender_name}
                                      {message.sender_role_title && (
                                        <span className="font-normal opacity-75">· {message.sender_role_title}</span>
                                      )}
                                    </p>
                                  )}

                                  <ContextMenu>
                                    <ContextMenuTrigger asChild>
                                      <div
                                        className="relative"
                                        onTouchStart={(event) =>
                                          handleTouchStart(message, event)
                                        }
                                        onTouchMove={(event) =>
                                          handleTouchMove(message, event)
                                        }
                                        onTouchEnd={() =>
                                          handleTouchEnd(message)
                                        }
                                        onTouchCancel={() => {
                                          touchStateRef.current = null;
                                          setSwipeHint(null);
                                        }}
                                      >
                                        {swipeOffset !== 0 && (
                                          <div
                                            className={cn(
                                              "absolute inset-y-0 flex items-center text-[10px] font-semibold uppercase tracking-[0.22em]",
                                              mine
                                                ? "-left-14 justify-start"
                                                : "-right-14 justify-end",
                                              currentTheme.dark
                                                ? "text-slate-300"
                                                : "text-slate-400",
                                            )}
                                          >
                                            <Reply className="w-3.5 h-3.5" />
                                          </div>
                                        )}

                                        <div
                                          className="transition-transform duration-150"
                                          style={{
                                            transform: `translateX(${swipeOffset}px)`,
                                          }}
                                        >
                                          <div
                                            className={cn(
                                              "rounded-2xl px-3.5 py-2.5 text-[13px] leading-[1.55] border",
                                              isStickerMessage
                                                ? "border-transparent bg-transparent shadow-none"
                                                : mine
                                                ? "rounded-tr-md text-white border-transparent"
                                                : "rounded-tl-md",
                                            )}
                                            style={{
                                              background: isStickerMessage
                                                ? "transparent"
                                                : mine
                                                ? currentTheme.mineBubble
                                                : currentTheme.otherBubble,
                                              borderColor: isStickerMessage || mine
                                                ? "transparent"
                                                : currentTheme.otherBorder,
                                              boxShadow: isStickerMessage
                                                ? "none"
                                                : mine
                                                ? "0 2px 7px rgba(10,79,232,0.14)"
                                                : currentTheme.dark
                                                  ? "0 2px 7px rgba(2,6,23,0.22)"
                                                  : "0 2px 7px rgba(15,23,42,0.06)",
                                            }}
                                          >
                                            {message.reply_to && (
                                              <button
                                                onClick={() =>
                                                  scrollToMessage(
                                                    message.reply_to!.id,
                                                  )
                                                }
                                                className={cn(
                                                  "w-full text-left mb-2 rounded-2xl px-3 py-2 border",
                                                  mine
                                                    ? "bg-white/10 border-white/15"
                                                    : "bg-slate-50/85 border-slate-200/80",
                                                )}
                                              >
                                                <p
                                                  className={cn(
                                                    "text-[11px] font-semibold",
                                                    mine
                                                      ? "text-white/70"
                                                      : "text-slate-500",
                                                  )}
                                                >
                                                  Replying to{" "}
                                                  {message.reply_to.sender_name}
                                                </p>
                                                <p
                                                  className={cn(
                                                    "text-[11px] mt-1 line-clamp-2",
                                                    mine
                                                      ? "text-white/85"
                                                      : "text-slate-600",
                                                  )}
                                                >
                                                  {describeMessage(
                                                    message.reply_to,
                                                  )}
                                                </p>
                                              </button>
                                            )}

                                            {message.forwarded && (
                                              <div
                                                className={cn(
                                                  "text-[11px] mb-2 pl-3 border-l-2 flex items-start gap-1.5 italic",
                                                  mine
                                                    ? "border-white/40 text-white/80"
                                                    : "border-[#0A4FE8]/20 text-slate-500",
                                                )}
                                              >
                                                <CornerDownRight className="w-3 h-3 shrink-0 mt-0.5" />
                                                <span>
                                                  Forwarded from{" "}
                                                  <span className="font-bold underline decoration-dotted underline-offset-2">
                                                    {
                                                      message.forwarded
                                                        .original_sender_name
                                                    }
                                                  </span>
                                                </span>
                                              </div>
                                            )}

                                            {(message.pinned_at ||
                                              starredByMe ||
                                              bookmarkedByMe ||
                                              message.delivery_status ===
                                                "scheduled") && (
                                              <div
                                                className={cn(
                                                  "mb-2 flex flex-wrap gap-1.5",
                                                  mine
                                                    ? "justify-end"
                                                    : "justify-start",
                                                )}
                                              >
                                                {message.pinned_at && (
                                                  <span
                                                    className={cn(
                                                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]",
                                                      mine
                                                        ? "bg-white/15 text-white/85"
                                                        : "bg-blue-50 text-blue-700",
                                                    )}
                                                  >
                                                    <Pin className="w-3 h-3" />{" "}
                                                    Pinned
                                                  </span>
                                                )}
                                                {starredByMe && (
                                                  <span
                                                    className={cn(
                                                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]",
                                                      mine
                                                        ? "bg-white/15 text-white/85"
                                                        : "bg-amber-50 text-amber-700",
                                                    )}
                                                  >
                                                    <Star className="w-3 h-3" />{" "}
                                                    Starred
                                                  </span>
                                                )}
                                                {bookmarkedByMe && (
                                                  <span
                                                    className={cn(
                                                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]",
                                                      mine
                                                        ? "bg-white/15 text-white/85"
                                                        : "bg-emerald-50 text-emerald-700",
                                                    )}
                                                  >
                                                    <Bookmark className="w-3 h-3" />{" "}
                                                    Saved
                                                  </span>
                                                )}
                                                {message.delivery_status ===
                                                  "scheduled" && (
                                                  <span
                                                    className={cn(
                                                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]",
                                                      mine
                                                        ? "bg-white/15 text-white/85"
                                                        : "bg-slate-100 text-slate-600",
                                                    )}
                                                  >
                                                    <Clock3 className="w-3 h-3" />{" "}
                                                    Scheduled
                                                  </span>
                                                )}
                                              </div>
                                            )}

                                            {message.deleted_at ? (
                                              <div
                                                className={cn(
                                                  "italic flex items-center gap-2",
                                                  mine
                                                    ? "text-white/80"
                                                    : currentTheme.dark
                                                      ? "text-slate-300"
                                                      : "text-slate-500",
                                                )}
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Message deleted
                                              </div>
                                            ) : sticker ? (
                                              <div className="min-w-[150px] bg-transparent p-2 text-center">
                                                  <img
                                                    src={animatedNotoStickerUrl(
                                                      sticker.notoCode,
                                                    )}
                                                    alt={sticker.emoji}
                                                    className={cn(
                                                      "cds-sticker-motion mx-auto h-24 w-24 object-contain",
                                                      sticker.motion,
                                                    )}
                                                  />
                                                  <p className={cn("mt-2 text-[11px] font-semibold", currentTheme.dark ? "text-slate-300" : "text-slate-500")}>
                                                    {sticker.title}
                                                  </p>
                                              </div>
                                            ) : customSticker ? (
                                              <div className="min-w-[150px] bg-transparent p-2 text-center">
                                                {customSticker.asset_url ? (
                                                  <img
                                                    src={customSticker.asset_url}
                                                    alt={customSticker.title}
                                                    className="cds-sticker-motion cds-sticker-float mx-auto h-28 w-28 object-contain"
                                                  />
                                                ) : (
                                                  <div className="cds-sticker-motion cds-sticker-pop text-[72px] leading-none">
                                                    {customSticker.emoji}
                                                  </div>
                                                )}
                                                <p className={cn("mt-2 text-[11px] font-semibold", currentTheme.dark ? "text-slate-300" : "text-slate-500")}>
                                                  {customSticker.title}
                                                </p>
                                              </div>
                                            ) : inlineImage &&
                                              message.attachment_url ? (
                                              <div className="-m-1">
                                                <a
                                                  href={message.attachment_url}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="block"
                                                >
                                                  <img
                                                    src={message.attachment_url}
                                                    alt={
                                                      message.file_name ||
                                                      inlineImageMarker?.[1] ||
                                                      "Shared photo"
                                                    }
                                                    className="max-h-72 max-w-full rounded-[18px] object-contain bg-black/5"
                                                  />
                                                </a>
                                                {message.body &&
                                                  !inlineImageMarker && (
                                                    <div
                                                      className={cn(
                                                        "px-1.5 pt-2.5 whitespace-pre-wrap break-words",
                                                        mine
                                                          ? "text-white"
                                                          : currentTheme.dark
                                                            ? "text-white"
                                                            : "text-[#0D1B39]",
                                                      )}
                                                    >
                                                      <Linkified
                                                        text={message.body}
                                                      />
                                                    </div>
                                                  )}
                                              </div>
                                            ) : (
                                              <>
                                                <div
                                                  className={cn(
                                                    "whitespace-pre-wrap break-words",
                                                    mine
                                                      ? "text-white"
                                                      : currentTheme.dark
                                                        ? "text-white"
                                                        : "text-[#0D1B39]",
                                                  )}
                                                >
                                                  <Linkified
                                                    text={message.body || ""}
                                                  />
                                                </div>
                                                {translatedEntries.length >
                                                  0 && (
                                                  <div
                                                    className={cn(
                                                      "mt-3 rounded-2xl border px-3 py-2",
                                                      mine
                                                        ? "border-white/15 bg-white/10"
                                                        : currentTheme.dark
                                                          ? "border-slate-700 bg-slate-900/60"
                                                          : "border-blue-100 bg-blue-50/70",
                                                    )}
                                                  >
                                                    {translatedEntries.map(
                                                      ([
                                                        language,
                                                        translated,
                                                      ]) => (
                                                        <div
                                                          key={language}
                                                          className="space-y-1"
                                                        >
                                                          <p
                                                            className={cn(
                                                              "text-[9px] font-bold uppercase tracking-[0.22em]",
                                                              mine
                                                                ? "text-white/65"
                                                                : "text-blue-600",
                                                            )}
                                                          >
                                                            {language}
                                                          </p>
                                                          <p
                                                            className={cn(
                                                              "text-[12px] leading-[1.55]",
                                                              mine
                                                                ? "text-white/88"
                                                                : currentTheme.dark
                                                                  ? "text-slate-200"
                                                                  : "text-slate-700",
                                                            )}
                                                          >
                                                            {translated}
                                                          </p>
                                                        </div>
                                                      ),
                                                    )}
                                                  </div>
                                                )}
                                                {(() => {
                                                  const linkUrl = firstUrl(
                                                    message.body,
                                                  );
                                                  if (!linkUrl) return null;
                                                  return (
                                                    <LinkPreview
                                                      url={linkUrl}
                                                      variant={
                                                        mine ||
                                                        currentTheme.dark
                                                          ? "dark"
                                                          : "light"
                                                      }
                                                    />
                                                  );
                                                })()}
                                                {!inlineImage &&
                                                  message.attachment_url &&
                                                  (() => {
                                                    const ageMs =
                                                      Date.now() -
                                                      new Date(
                                                        message.created_at,
                                                      ).getTime();
                                                    const expired =
                                                      ageMs >
                                                      7 * 24 * 60 * 60 * 1000;
                                                    return (
                                                      <div
                                                        className={cn(
                                                          "mt-3 rounded-2xl p-3 border flex items-center gap-3",
                                                          mine
                                                            ? "bg-white/10 border-white/15"
                                                            : currentTheme.dark
                                                              ? "bg-slate-900/55"
                                                              : "bg-slate-50/85",
                                                          expired &&
                                                            "opacity-60",
                                                        )}
                                                        style={{
                                                          borderColor: mine
                                                            ? "rgba(255,255,255,0.14)"
                                                            : currentTheme.otherBorder,
                                                        }}
                                                      >
                                                        <div
                                                          className={cn(
                                                            "w-10 h-10 rounded-2xl flex items-center justify-center",
                                                            mine
                                                              ? "bg-white/15 text-white"
                                                              : currentTheme.dark
                                                                ? "bg-slate-800 text-white"
                                                                : "bg-white text-[#0A4FE8]",
                                                          )}
                                                        >
                                                          {isInlineImageBody(
                                                            message.body,
                                                          ) ? (
                                                            <ImageIcon className="w-4 h-4" />
                                                          ) : (
                                                            <Paperclip className="w-4 h-4" />
                                                          )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                          <p
                                                            className={cn(
                                                              "text-[11px] font-semibold",
                                                              mine
                                                                ? "text-white"
                                                                : currentTheme.dark
                                                                  ? "text-white"
                                                                  : "text-[#0D1B39]",
                                                            )}
                                                          >
                                                            {expired
                                                              ? "Attachment expired"
                                                              : "Shared attachment"}
                                                          </p>
                                                          {expired ? (
                                                            <p
                                                              className={cn(
                                                                "text-[10px] mt-0.5",
                                                                mine
                                                                  ? "text-white/65"
                                                                  : currentTheme.dark
                                                                    ? "text-slate-400"
                                                                    : "text-slate-500",
                                                              )}
                                                            >
                                                              Attachments stay
                                                              available in chat
                                                              for 7 days.
                                                            </p>
                                                          ) : (
                                                            <a
                                                              href={
                                                                message.attachment_url
                                                              }
                                                              target="_blank"
                                                              rel="noreferrer"
                                                              className={cn(
                                                                "text-[10px] mt-0.5 font-semibold uppercase tracking-[0.22em]",
                                                                mine
                                                                  ? "text-white/80"
                                                                  : currentTheme.dark
                                                                    ? "text-sky-300"
                                                                    : "text-[#0A4FE8]",
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

                                            {socialEngagement &&
                                              !message.deleted_at && (
                                                <div
                                                  className={cn(
                                                    "mt-3 rounded-xl border p-2.5",
                                                    mine
                                                      ? "border-white/20 bg-white/10"
                                                      : currentTheme.dark
                                                        ? "border-slate-700 bg-slate-900/55"
                                                        : "border-slate-200 bg-slate-50",
                                                  )}
                                                >
                                                  <div className="flex items-center justify-between gap-3">
                                                    {viewer?.kind === "team" ? (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          toggleReaction(
                                                            message.id,
                                                            SOCIAL_COMPLETION_REACTION,
                                                          )
                                                        }
                                                        disabled={
                                                          message.id.startsWith(
                                                            "temp_",
                                                          ) ||
                                                          !viewer?.reactionKey
                                                        }
                                                        aria-pressed={
                                                          completedByMe
                                                        }
                                                        className={cn(
                                                          "inline-flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-50",
                                                          completedByMe
                                                            ? mine
                                                              ? "bg-white text-[#0A4FE8]"
                                                              : "bg-[#0A4FE8] text-white"
                                                            : mine
                                                              ? "bg-white/10 text-white hover:bg-white/20"
                                                              : currentTheme.dark
                                                                ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                                                                : "bg-white text-slate-700 hover:bg-slate-100",
                                                        )}
                                                      >
                                                        <span
                                                          className={cn(
                                                            "grid h-4 w-4 shrink-0 place-items-center rounded border",
                                                            completedByMe
                                                              ? "border-current"
                                                              : mine
                                                                ? "border-white/60"
                                                                : "border-slate-300",
                                                          )}
                                                        >
                                                          {completedByMe && (
                                                            <Check className="h-3 w-3" />
                                                          )}
                                                        </span>
                                                        {completedByMe
                                                          ? "Completed"
                                                          : "Mark complete"}
                                                      </button>
                                                    ) : (
                                                      <span
                                                        className={cn(
                                                          "text-[11px] font-semibold",
                                                          mine
                                                            ? "text-white"
                                                            : currentTheme.dark
                                                              ? "text-slate-200"
                                                              : "text-slate-700",
                                                        )}
                                                      >
                                                        Team completion
                                                      </span>
                                                    )}
                                                    <span
                                                      className={cn(
                                                        "shrink-0 text-[10px]",
                                                        mine
                                                          ? "text-white/75"
                                                          : currentTheme.dark
                                                            ? "text-slate-400"
                                                            : "text-slate-500",
                                                      )}
                                                    >
                                                      {completionIds.length}
                                                      {completionTotal > 0
                                                        ? ` of ${completionTotal}`
                                                        : ""}{" "}
                                                      done
                                                    </span>
                                                  </div>
                                                  {completionTotal > 0 && (
                                                    <div
                                                      className={cn(
                                                        "mt-2 h-1 overflow-hidden rounded-full",
                                                        mine
                                                          ? "bg-white/20"
                                                          : currentTheme.dark
                                                            ? "bg-slate-700"
                                                            : "bg-slate-200",
                                                      )}
                                                    >
                                                      <div
                                                        className={cn(
                                                          "h-full rounded-full transition-all",
                                                          mine
                                                            ? "bg-white"
                                                            : "bg-[#0A4FE8]",
                                                        )}
                                                        style={{
                                                          width: `${Math.min(100, (completionIds.length / completionTotal) * 100)}%`,
                                                        }}
                                                      />
                                                    </div>
                                                  )}
                                                </div>
                                              )}

                                            <div
                                              className={cn(
                                                "mt-2.5 flex items-center gap-2 text-[10px]",
                                                mine
                                                  ? "justify-end text-white/70"
                                                  : currentTheme.dark
                                                    ? "text-slate-400"
                                                    : "text-slate-400",
                                              )}
                                            >
                                              {message.edited_at &&
                                                !message.deleted_at && (
                                                  <span>edited</span>
                                                )}
                                              <span>
                                                {formatClock(
                                                  message.created_at,
                                                )}
                                              </span>
                                              {mine &&
                                                !message.deleted_at &&
                                                (message.id.startsWith(
                                                  "temp_",
                                                ) ? (
                                                  <Check
                                                    className="w-3.5 h-3.5 text-white/50"
                                                    aria-label="Sending"
                                                  />
                                                ) : readWatermark &&
                                                  new Date(
                                                    message.created_at,
                                                  ).getTime() <=
                                                    new Date(
                                                      readWatermark,
                                                    ).getTime() ? (
                                                  <CheckCheck
                                                    className="w-3.5 h-3.5 text-cyan-300"
                                                    aria-label="Read"
                                                  />
                                                ) : (
                                                  <CheckCheck
                                                    className="w-3.5 h-3.5 text-white/50"
                                                    aria-label="Sent"
                                                  />
                                                ))}
                                            </div>
                                          </div>
                                        </div>

                                        <div
                                          className={cn(
                                            "mt-1.5 flex items-center gap-1.5 px-1",
                                            mine
                                              ? "justify-end"
                                              : "justify-start",
                                          )}
                                        >
                                          {reactionEntries.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                              {reactionEntries.map(
                                                ([emoji, ids]) => {
                                                  const active =
                                                    viewer?.reactionKey
                                                      ? ids.includes(
                                                          viewer.reactionKey,
                                                        )
                                                      : false;
                                                  return (
                                                    <button
                                                      key={emoji}
                                                      onClick={() =>
                                                        toggleReaction(
                                                          message.id,
                                                          emoji,
                                                        )
                                                      }
                                                      className={cn(
                                                        "h-7 rounded-full px-2.5 text-[11px] font-medium inline-flex items-center gap-1 border transition",
                                                        active
                                                          ? "bg-blue-100 text-blue-700 border-blue-200"
                                                          : currentTheme.dark
                                                            ? "bg-slate-900/70 text-slate-200 border-slate-700"
                                                            : "bg-white/90 text-slate-600 border-slate-200",
                                                      )}
                                                    >
                                                      <span className="text-sm leading-none">
                                                        {emoji}
                                                      </span>
                                                      <span>{ids.length}</span>
                                                    </button>
                                                  );
                                                },
                                              )}
                                            </div>
                                          )}

                                          <div
                                            className={cn(
                                              "flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition",
                                              mine
                                                ? "justify-end"
                                                : "justify-start",
                                            )}
                                          >
                                            <button
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setReactionPickerFor(
                                                  reactionPickerFor ===
                                                    message.id
                                                    ? null
                                                    : message.id,
                                                );
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
                                              onClick={() =>
                                                queueReply(message)
                                              }
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
                                            <UniversalShareButton
                                              title={`Message from ${message.sender_name}`}
                                              text={describeMessage(message)}
                                              chatText={describeMessage(message)}
                                              url="/"
                                              label="Share message"
                                              iconOnly
                                              className={cn(
                                                "!h-8 !min-h-8 !w-8 !rounded-full !p-0",
                                                currentTheme.dark
                                                  ? "!border-slate-700 !bg-slate-900/70 !text-slate-200 hover:!bg-slate-800"
                                                  : "!border-slate-200 !bg-white/90 !text-slate-500",
                                              )}
                                            />
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void copyMessage(message)
                                              }
                                              className={cn(
                                                "w-8 h-8 rounded-full grid place-items-center border",
                                                currentTheme.dark
                                                  ? "bg-slate-900/70 text-slate-200 border-slate-700"
                                                  : "bg-white/90 text-slate-500 border-slate-200",
                                              )}
                                              title="Copy entire message"
                                              aria-label="Copy entire message"
                                            >
                                              {copiedMessageId ===
                                              message.id ? (
                                                <Check className="w-4 h-4 text-emerald-500" />
                                              ) : (
                                                <Copy className="w-4 h-4" />
                                              )}
                                            </button>
                                            <button
                                              onClick={() =>
                                                setActionMessage(message)
                                              }
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
                                              onClick={(event) =>
                                                event.stopPropagation()
                                              }
                                              className={cn(
                                                "absolute z-30 -top-12 rounded-full px-2 py-1.5 flex items-center gap-0.5 shadow-2xl border",
                                                mine ? "right-0" : "left-0",
                                                currentTheme.dark
                                                  ? "bg-slate-900 border-slate-700"
                                                  : "bg-white border-slate-200",
                                              )}
                                            >
                                              {REACTION_EMOJIS.map((emoji) => (
                                                <button
                                                  key={emoji}
                                                  onClick={() =>
                                                    toggleReaction(
                                                      message.id,
                                                      emoji,
                                                    )
                                                  }
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
                                        <ContextMenuItem
                                          onClick={() =>
                                            scrollToMessage(
                                              message.reply_to!.id,
                                            )
                                          }
                                        >
                                          <CornerDownRight className="w-4 h-4 mr-2" />{" "}
                                          View replied message
                                        </ContextMenuItem>
                                      )}
                                      <ContextMenuItem
                                        onClick={() => queueReply(message)}
                                      >
                                        <Reply className="w-4 h-4 mr-2" /> Reply
                                      </ContextMenuItem>
                                      <ContextMenuItem
                                        onClick={() =>
                                          setReactionPickerFor(message.id)
                                        }
                                      >
                                        <SmilePlus className="w-4 h-4 mr-2" />{" "}
                                        React
                                      </ContextMenuItem>
                                      {canEditMessage(message) && (
                                        <ContextMenuItem
                                          onClick={() => beginEdit(message)}
                                        >
                                          <Pencil className="w-4 h-4 mr-2" />{" "}
                                          Edit
                                        </ContextMenuItem>
                                      )}
                                      <ContextMenuItem
                                        onClick={() => setForwarding(message)}
                                      >
                                        <Forward className="w-4 h-4 mr-2" />{" "}
                                        Forward
                                      </ContextMenuItem>
                                      <ContextMenuSeparator />
                                      <ContextMenuItem
                                        onClick={() =>
                                          runMessageAction(
                                            message,
                                            message.pinned_at ? "unpin" : "pin",
                                          )
                                        }
                                      >
                                        <Pin className="w-4 h-4 mr-2" />{" "}
                                        {message.pinned_at ? "Unpin" : "Pin"}{" "}
                                        message
                                      </ContextMenuItem>
                                      <ContextMenuItem
                                        onClick={() =>
                                          runMessageAction(
                                            message,
                                            starredByMe ? "unstar" : "star",
                                          )
                                        }
                                      >
                                        <Star className="w-4 h-4 mr-2" />{" "}
                                        {starredByMe ? "Unstar" : "Star"}{" "}
                                        message
                                      </ContextMenuItem>
                                      <ContextMenuItem
                                        onClick={() =>
                                          runMessageAction(
                                            message,
                                            bookmarkedByMe
                                              ? "unbookmark"
                                              : "bookmark",
                                          )
                                        }
                                      >
                                        <Bookmark className="w-4 h-4 mr-2" />{" "}
                                        {bookmarkedByMe
                                          ? "Remove bookmark"
                                          : "Bookmark"}
                                      </ContextMenuItem>
                                      {message.body && (
                                        <ContextMenuItem
                                          onClick={() =>
                                            runMessageAction(
                                              message,
                                              "translate",
                                            )
                                          }
                                        >
                                          <Languages className="w-4 h-4 mr-2" />{" "}
                                          Translate
                                        </ContextMenuItem>
                                      )}
                                      {canDeleteMessage(message) && (
                                        <>
                                          <ContextMenuSeparator />
                                          <ContextMenuItem
                                            onClick={() =>
                                              deleteMessage(message.id)
                                            }
                                            className="text-rose-600 focus:text-rose-600"
                                          >
                                            <Trash2 className="w-4 h-4 mr-2" />{" "}
                                            Delete
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

              {!atBottom && (
                <button
                  type="button"
                  onClick={() => scrollToBottom("smooth")}
                  aria-label="Jump to latest messages"
                  className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-[#0A4FE8] text-white py-2 pl-2.5 pr-2.5 shadow-lg shadow-blue-900/25 hover:bg-[#083DBE] active:scale-95 transition"
                >
                  {jumpCount > 0 && (
                    <span className="min-w-5 h-5 px-1 rounded-full bg-white text-[#0A4FE8] text-[11px] font-bold grid place-items-center">
                      {jumpCount > 99 ? "99+" : jumpCount}
                    </span>
                  )}
                  <ChevronLeft className="w-4 h-4 -rotate-90" />
                </button>
              )}
            </div>

            {composerPanel && (
              <div
                className="border-t px-3 sm:px-4 py-3"
                style={{
                  background: currentTheme.composer,
                  borderColor: currentTheme.dark
                    ? "rgba(71,85,105,0.54)"
                    : "rgba(226,232,240,0.72)",
                }}
              >
                {composerPanel === "emoji" && (
                  <div className="space-y-3">
                    {EMOJI_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-[0.24em] mb-2",
                            currentTheme.dark
                              ? "text-slate-400"
                              : "text-slate-500",
                          )}
                        >
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
                                currentTheme.dark
                                  ? "bg-slate-900/70 border-slate-700"
                                  : "bg-white/90 border-slate-200",
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
                  <div className="max-h-[44dvh] space-y-4 overflow-y-auto pr-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p
                          className={cn(
                            "text-[13px] font-semibold",
                            currentTheme.dark
                              ? "text-white"
                              : "text-slate-800",
                          )}
                        >
                          Stickers
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 text-[10px]",
                            currentTheme.dark
                              ? "text-slate-400"
                              : "text-slate-500",
                          )}
                        >
                          Upload an image or a video up to 6 seconds. Videos are converted to looping GIF stickers.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          ref={stickerFileInputRef}
                          type="file"
                          accept="image/gif,image/webp,image/png,image/jpeg,video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-matroska"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadCustomSticker(file);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => stickerFileInputRef.current?.click()}
                          disabled={stickerSaving}
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-semibold transition disabled:opacity-50",
                            currentTheme.dark
                              ? "border-slate-700 bg-slate-900 text-slate-200"
                              : "border-slate-200 bg-white text-slate-700",
                          )}
                        >
                          <Upload className="h-3.5 w-3.5" /> Add sticker
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setShowStickerCreator((current) => !current)
                          }
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0A4FE8] px-3 text-[11px] font-semibold text-white transition hover:bg-[#083EC0]"
                        >
                          <Plus className="h-3.5 w-3.5" /> Create
                        </button>
                      </div>
                    </div>

                    {showStickerCreator && (
                      <div
                        className={cn(
                          "grid gap-3 rounded-2xl border p-3 sm:grid-cols-[96px_1fr]",
                          currentTheme.dark
                            ? "border-slate-700 bg-slate-900/60"
                            : "border-slate-200 bg-slate-50",
                        )}
                      >
                        <div className="grid h-24 w-24 place-items-center rounded-2xl bg-transparent text-[52px]">
                          <span className="cds-sticker-motion cds-sticker-pop">
                            {stickerEmoji || "🙂"}
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[90px_1fr_auto] sm:items-end">
                          <label className="grid gap-1 text-[10px] text-slate-500">
                            Emoji
                            <input
                              value={stickerEmoji}
                              onChange={(event) =>
                                setStickerEmoji(event.target.value.slice(0, 24))
                              }
                              className={cn(
                                "h-10 rounded-xl border px-3 text-xl outline-none",
                                currentTheme.dark
                                  ? "border-slate-700 bg-slate-950 text-white"
                                  : "border-slate-200 bg-white text-slate-900",
                              )}
                            />
                          </label>
                          <label className="grid gap-1 text-[10px] text-slate-500">
                            Sticker name
                            <input
                              value={stickerTitle}
                              onChange={(event) =>
                                setStickerTitle(event.target.value.slice(0, 40))
                              }
                              placeholder="Team favourite"
                              className={cn(
                                "h-10 rounded-xl border px-3 text-[12px] outline-none",
                                currentTheme.dark
                                  ? "border-slate-700 bg-slate-950 text-white"
                                  : "border-slate-200 bg-white text-slate-900",
                              )}
                            />
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void createEmojiSticker()}
                              disabled={!stickerEmoji.trim() || stickerSaving}
                              className="h-10 rounded-xl bg-[#0A4FE8] px-4 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              {stickerSaving ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {(stickersLoading || customStickers.length > 0) && (
                      <div>
                        <p
                          className={cn(
                            "mb-2 text-[11px] font-semibold",
                            currentTheme.dark
                              ? "text-slate-300"
                              : "text-slate-600",
                          )}
                        >
                          Team stickers
                        </p>
                        {stickersLoading ? (
                          <div className="flex h-20 items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" />
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                            {customStickers.map((sticker) => (
                              <button
                                key={sticker.id}
                                type="button"
                                onClick={() => void sendCustomSticker(sticker)}
                                className={cn(
                                  "group/sticker rounded-2xl border border-transparent bg-transparent p-2 text-center transition hover:-translate-y-0.5 hover:bg-slate-500/5",
                                  currentTheme.dark ? "hover:border-slate-700" : "hover:border-slate-200",
                                )}
                                title={sticker.title}
                              >
                                {sticker.asset_url ? (
                                  <img
                                    src={sticker.asset_url}
                                    alt={sticker.title}
                                    className="cds-sticker-motion cds-sticker-float mx-auto h-14 w-14 object-contain"
                                  />
                                ) : (
                                  <span className="cds-sticker-motion cds-sticker-pop block text-[40px] leading-[56px]">
                                    {sticker.emoji}
                                  </span>
                                )}
                                <span className={cn("mt-1 block truncate text-[9px] font-medium", currentTheme.dark ? "text-slate-300" : "text-slate-500")}>
                                  {sticker.title}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p
                          className={cn(
                            "text-[11px] font-semibold",
                            currentTheme.dark
                              ? "text-slate-300"
                              : "text-slate-600",
                          )}
                        >
                          Animated essentials
                        </p>
                        <a
                          href="https://googlefonts.github.io/noto-emoji-files/"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[9px] text-slate-400 underline underline-offset-2"
                        >
                          Noto Animated Emoji · CC BY 4.0
                        </a>
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {STICKERS.map((sticker) => (
                          <button
                            key={sticker.key}
                            type="button"
                            onClick={() =>
                              sendMessage({ stickerKey: sticker.key })
                            }
                            className={cn(
                              "rounded-2xl border border-transparent bg-transparent p-2 text-center transition hover:-translate-y-0.5 hover:bg-slate-500/5",
                              currentTheme.dark ? "hover:border-slate-700" : "hover:border-slate-200",
                            )}
                          >
                            <img
                              src={animatedNotoStickerUrl(sticker.notoCode)}
                              alt={sticker.emoji}
                              className={cn(
                                "cds-sticker-motion mx-auto h-14 w-14 object-contain",
                                sticker.motion,
                              )}
                            />
                            <span className={cn("mt-1 block truncate text-[9px] font-medium", currentTheme.dark ? "text-slate-300" : "text-slate-500")}>
                              {sticker.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {composerPanel === "background" && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(
                      Object.entries(CHAT_BACKGROUNDS) as [
                        ChatBackgroundKey,
                        (typeof CHAT_BACKGROUNDS)[ChatBackgroundKey],
                      ][]
                    ).map(([key, background]) => (
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
                        <div
                          className="h-16 rounded-[18px] border mb-3"
                          style={{
                            background: background.shell,
                            borderColor: "rgba(255,255,255,0.35)",
                          }}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p
                              className={cn(
                                "text-[12px] font-semibold",
                                currentTheme.dark
                                  ? "text-white"
                                  : "text-[#0D1B39]",
                              )}
                            >
                              {background.label}
                            </p>
                            <p
                              className={cn(
                                "text-[10px]",
                                currentTheme.dark
                                  ? "text-slate-400"
                                  : "text-slate-500",
                              )}
                            >
                              Saved on this device
                            </p>
                          </div>
                          {chatBackground === key && (
                            <CheckCheck
                              className={cn(
                                "w-4 h-4",
                                currentTheme.dark
                                  ? "text-sky-300"
                                  : "text-blue-600",
                              )}
                            />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {typingUsers.length > 0 && (
              <div
                className="border-t px-4 pt-2 -mb-1"
                style={{
                  background: currentTheme.composer,
                  borderColor: currentTheme.dark
                    ? "rgba(71,85,105,0.54)"
                    : "rgba(226,232,240,0.72)",
                }}
              >
                <div
                  className="inline-flex items-center gap-2 text-[11px] font-semibold"
                  style={{ color: currentTheme.accent }}
                >
                  <span className="flex gap-0.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
                      style={{ animationDelay: "120ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
                      style={{ animationDelay: "240ms" }}
                    />
                  </span>
                  <span>
                    {typingUsers.length === 1
                      ? `${typingUsers[0].name} is typing...`
                      : typingUsers.length === 2
                        ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`
                        : `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing...`}
                  </span>
                </div>
              </div>
            )}

            <div
              className="border-t p-3 sm:p-4 relative"
              style={{
                background: currentTheme.composer,
                borderColor: currentTheme.dark
                  ? "rgba(71,85,105,0.54)"
                  : "rgba(226,232,240,0.72)",
              }}
            >
              {composerLocked && (
                <div className="flex items-center justify-center gap-2 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-2.5 text-[12px] font-semibold text-amber-700">
                  <Megaphone className="w-3.5 h-3.5" />
                  Announcements channel - only management can post. You can
                  read, react and acknowledge.
                </div>
              )}
              {!composerLocked && (replyingTo || editingMessageId) && (
                <div
                  className={cn(
                    "mb-3 rounded-[22px] border px-4 py-3 flex items-start justify-between gap-3",
                    currentTheme.dark
                      ? "bg-slate-900/70 border-slate-700"
                      : "bg-white/90 border-slate-200",
                  )}
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-[11px] font-semibold",
                        currentTheme.dark ? "text-sky-300" : "text-blue-600",
                      )}
                    >
                      {editingMessageId
                        ? "Editing message"
                        : replyingTo
                          ? `Replying to ${replyingTo.sender_name}`
                          : ""}
                    </p>
                    <p
                      className={cn(
                        "text-[12px] mt-1 truncate",
                        currentTheme.dark ? "text-slate-300" : "text-slate-600",
                      )}
                    >
                      {editingMessageId
                        ? "Update your message and send to save the edit."
                        : replyingTo
                          ? describeMessage(replyingTo)
                          : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (editingMessageId) setInput("");
                      resetComposerState();
                    }}
                    className={cn(
                      "p-1.5 rounded-full",
                      currentTheme.dark
                        ? "text-slate-400 hover:bg-slate-800"
                        : "text-slate-400 hover:bg-slate-100",
                    )}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2 sm:gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv"
                />

                {/* The picker stays focused on managed group spaces. Direct
                    chats can still receive a photo pasted into the composer. */}
                {attachmentsAllowed && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className={cn(
                      "p-2.5 rounded-full transition border",
                      currentTheme.dark
                        ? "text-slate-300 hover:text-white bg-slate-900/60 border-slate-700 hover:bg-slate-800"
                        : "text-gray-400 hover:text-[#0A4FE8] bg-white/88 border-slate-200 hover:border-blue-100",
                    )}
                    title="Upload image (≤5MB) or PDF (≤20MB)"
                  >
                    {uploading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Paperclip className="w-5 h-5" />
                    )}
                  </button>
                )}

                <div
                  className="flex-1 rounded-2xl border shadow-sm"
                  style={{
                    background: currentTheme.dark
                      ? "rgba(2,6,23,0.72)"
                      : "rgba(255,255,255,0.92)",
                    borderColor: currentTheme.dark
                      ? "rgba(71,85,105,0.58)"
                      : "rgba(226,232,240,0.8)",
                  }}
                >
                  {pendingImage && (
                    <div
                      className={cn(
                        "mx-2 mt-2 flex items-center gap-3 rounded-xl border p-2",
                        currentTheme.dark
                          ? "border-slate-700 bg-slate-900/70"
                          : "border-slate-200 bg-slate-50",
                      )}
                    >
                      <img
                        src={pendingImage.url}
                        alt="Photo ready to send"
                        className="h-16 w-16 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-[12px] font-semibold",
                            currentTheme.dark
                              ? "text-white"
                              : "text-slate-800",
                          )}
                        >
                          {pendingImage.name}
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 text-[10px]",
                            currentTheme.dark
                              ? "text-slate-400"
                              : "text-slate-500",
                          )}
                        >
                          Add a caption below, or send the photo as it is.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingImage(null)}
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-full transition",
                          currentTheme.dark
                            ? "text-slate-300 hover:bg-slate-800"
                            : "text-slate-500 hover:bg-white",
                        )}
                        aria-label="Remove pasted photo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-1 px-1.5 py-1.5">
                    <div className="flex items-center gap-1 pb-1 pl-1">
                      <button
                        onClick={() =>
                          setComposerPanel(
                            composerPanel === "emoji" ? null : "emoji",
                          )
                        }
                        className={cn(
                          "w-9 h-9 rounded-xl grid place-items-center transition",
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
                        onClick={() =>
                          setComposerPanel(
                            composerPanel === "stickers" ? null : "stickers",
                          )
                        }
                        className={cn(
                          "w-9 h-9 rounded-xl grid place-items-center transition",
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
                      {mentionActive && (
                        <div
                          className={cn(
                            "absolute bottom-full left-0 mb-2 w-72 max-h-64 overflow-y-auto rounded-2xl border shadow-xl z-30 py-1",
                            currentTheme.dark
                              ? "bg-slate-900 border-slate-700"
                              : "bg-white border-slate-200",
                          )}
                        >
                          <p
                            className={cn(
                              "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider",
                              currentTheme.dark
                                ? "text-slate-500"
                                : "text-slate-400",
                            )}
                          >
                            Mention a member
                          </p>
                          {mentionMatches.map((member, i) => (
                            <button
                              key={member.id}
                              type="button"
                              // Use onMouseDown so the textarea doesn't lose focus/selection first.
                              onMouseDown={(e) => {
                                e.preventDefault();
                                insertMention(member);
                              }}
                              onMouseEnter={() => setMentionIndex(i)}
                              className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2 text-left transition",
                                i === mentionIndex
                                  ? currentTheme.dark
                                    ? "bg-slate-800"
                                    : "bg-blue-50"
                                  : currentTheme.dark
                                    ? "hover:bg-slate-800/60"
                                    : "hover:bg-slate-50",
                              )}
                            >
                              <span
                                className={cn(
                                  "w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold shrink-0 overflow-hidden",
                                  currentTheme.dark
                                    ? "bg-slate-700 text-slate-100"
                                    : "bg-blue-100 text-blue-700",
                                )}
                              >
                                {member.id === EVERYONE_MENTION_ID ? (
                                  "@"
                                ) : member.avatar_url ? (
                                  <img
                                    src={member.avatar_url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  initials(
                                    member.full_name || member.username || "?",
                                  )
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span
                                  className={cn(
                                    "block text-[13px] font-semibold truncate",
                                    currentTheme.dark
                                      ? "text-white"
                                      : "text-[#0D1B39]",
                                  )}
                                >
                                  {member.full_name || member.username}
                                </span>
                                {member.role_title && (
                                  <span
                                    className={cn(
                                      "block text-[11px] truncate",
                                      currentTheme.dark
                                        ? "text-slate-400"
                                        : "text-slate-400",
                                    )}
                                  >
                                    {member.role_title}
                                  </span>
                                )}
                              </span>
                              {member.status === "online" && (
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      <textarea
                        ref={composerRef}
                        rows={1}
                        value={input}
                        onChange={(event) =>
                          onComposerChange(
                            event.target.value,
                            event.target.selectionStart,
                          )
                        }
                        onPaste={handleComposerPaste}
                        onKeyUp={(event) => {
                          // Keep the token in sync when moving the caret with arrows/click.
                          if (
                            ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                              event.key,
                            )
                          ) {
                            detectMention(
                              event.currentTarget.value,
                              event.currentTarget.selectionStart,
                            );
                          }
                        }}
                        onKeyDown={(event) => {
                          if (mentionActive) {
                            if (event.key === "ArrowDown") {
                              event.preventDefault();
                              setMentionIndex(
                                (i) => (i + 1) % mentionMatches.length,
                              );
                              return;
                            }
                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              setMentionIndex(
                                (i) =>
                                  (i - 1 + mentionMatches.length) %
                                  mentionMatches.length,
                              );
                              return;
                            }
                            if (event.key === "Enter" || event.key === "Tab") {
                              event.preventDefault();
                              insertMention(mentionMatches[mentionIndex]);
                              return;
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setMentionQuery(null);
                              setMentionAnchor(null);
                              return;
                            }
                          }
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            submitComposer();
                          }
                        }}
                        placeholder={
                          composerLocked
                            ? "Only management can post in this channel"
                            : editingMessageId
                              ? "Edit your message..."
                              : pendingImage
                                ? "Add a caption..."
                              : "Type a message or paste a photo..."
                        }
                        readOnly={composerLocked}
                        className={cn(
                          "w-full bg-transparent px-2 py-2.5 text-[13px] focus:outline-none resize-none overflow-y-auto",
                          currentTheme.dark
                            ? "text-white placeholder:text-slate-500"
                            : "text-[#0D1B39] placeholder:text-slate-400",
                        )}
                        style={{ lineHeight: "1.55", maxHeight: 156 }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={submitComposer}
                  disabled={
                    (!input.trim() && !pendingImage) ||
                    sending ||
                    uploading ||
                    composerLocked
                  }
                  className="shrink-0 w-11 h-11 flex items-center justify-center bg-[#0A4FE8] text-white rounded-full hover:bg-[#083EC0] transition shadow-sm disabled:opacity-50 disabled:shadow-none"
                  aria-label={uploading ? "Sending photo" : "Send message"}
                >
                  {sending || uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : editingMessageId ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
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
          onDone={() => {
            setForwarding(null);
            reloadCurrent();
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
          onPin={() =>
            runMessageAction(
              actionMessage,
              actionMessage.pinned_at ? "unpin" : "pin",
            )
          }
          onStar={() =>
            runMessageAction(
              actionMessage,
              viewer?.reactionKey &&
                (actionMessage.starred_by || []).includes(viewer.reactionKey)
                ? "unstar"
                : "star",
            )
          }
          onBookmark={() =>
            runMessageAction(
              actionMessage,
              viewer?.reactionKey &&
                (actionMessage.bookmarked_by || []).includes(viewer.reactionKey)
                ? "unbookmark"
                : "bookmark",
            )
          }
          onTranslate={
            actionMessage.body
              ? () => runMessageAction(actionMessage, "translate")
              : undefined
          }
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

      <MeetingModeModal
        open={Boolean(meetingPrompt)}
        kind={meetingPrompt || "video"}
        defaultTitle={meetingTitleFor(meetingPrompt || "video")}
        busy={Boolean(starting)}
        requiresApproval={false}
        onClose={() => {
          if (!starting) setMeetingPrompt(null);
        }}
        onSubmit={(request) => createMeeting(meetingPrompt || "video", request)}
      />
    </div>
  );
}

function AdvancedChatToolkit({
  thread,
  theme,
  query,
  results,
  searching,
  onQueryChange,
  onSearch,
  onJump,
  onStartCall,
  onUpload,
  viewer,
  onNewChat,
  onThreadUpdated,
}: {
  thread: Thread;
  theme: (typeof CHAT_BACKGROUNDS)[ChatBackgroundKey];
  query: string;
  results: ChatSearchResult[];
  searching: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onJump: (messageId: string) => void;
  onStartCall: (kind: "voice" | "video") => void;
  onUpload?: () => void;
  viewer: ViewerInfo | null;
  onNewChat: () => void;
  onThreadUpdated: () => void;
}) {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [savingThread, setSavingThread] = useState(false);
  const isManagement = viewer?.kind === "admin" || !!viewer?.isManagement;

  const features: { label: string; icon: typeof AtSign; state: string }[] = [
    { label: "DMs", icon: AtSign, state: "one-to-one + saved" },
    { label: "Groups", icon: UsersIcon, state: thread.visibility || "private" },
    { label: "Files", icon: FileStack, state: "versions + approval" },
    { label: "Tasks", icon: ClipboardList, state: "due dates + progress" },
    { label: "Polls", icon: Vote, state: "thread polls" },
    { label: "Events", icon: CalendarClock, state: "calendar-ready" },
    { label: "Voice", icon: Mic2, state: "cMeet rooms" },
    { label: "Wiki", icon: BookOpenText, state: "knowledge base" },
    { label: "Security", icon: ShieldCheck, state: "audit + permissions" },
  ];

  async function patchThread(payload: Record<string, unknown>) {
    setSavingThread(true);
    try {
      const res = await fetch("/api/team/chat/threads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id, ...payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Update failed");
      onThreadUpdated();
      return true;
    } catch (error) {
      appAlert({
        title: "Conversation",
        message: error instanceof Error ? error.message : "Update failed",
        kind: "error",
      });
      return false;
    } finally {
      setSavingThread(false);
    }
  }

  async function copyInvite() {
    if (!thread.invite_code) return;
    try {
      await navigator.clipboard?.writeText(thread.invite_code);
      appAlert({
        title: "Invite",
        message: "Invite code copied to clipboard.",
        kind: "success",
      });
    } catch {
      /* clipboard blocked - no-op */
    }
  }

  return (
    <div
      className="border-b px-3 sm:px-6 py-3 sm:py-4 space-y-3"
      style={{
        background: theme.composer,
        borderColor: theme.dark
          ? "rgba(71,85,105,0.54)"
          : "rgba(226,232,240,0.72)",
      }}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div
          className={cn(
            "rounded-[24px] border p-3",
            theme.dark
              ? "border-slate-700 bg-slate-900/55"
              : "border-slate-200 bg-white/78",
          )}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className={cn(
                  "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4",
                  theme.dark ? "text-slate-500" : "text-slate-400",
                )}
              />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSearch();
                }}
                placeholder="Search this conversation"
                className={cn(
                  "w-full rounded-2xl border py-3 pl-10 pr-3 text-[13px] outline-none focus:ring-2",
                  theme.dark
                    ? "border-slate-700 bg-slate-950/60 text-white placeholder:text-slate-500 focus:ring-sky-500/20"
                    : "border-slate-200 bg-white text-[#0D1B39] placeholder:text-slate-400 focus:ring-blue-100",
                )}
              />
            </div>
            <button
              onClick={onSearch}
              disabled={searching || query.trim().length < 2}
              className="h-11 rounded-2xl bg-[#0A4FE8] px-4 text-[12px] font-bold text-white disabled:opacity-50"
            >
              {searching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Search"
              )}
            </button>
          </div>

          {results.length > 0 && (
            <div className="mt-3 max-h-44 overflow-y-auto space-y-1.5">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => onJump(result.id)}
                  className={cn(
                    "w-full rounded-2xl border px-3 py-2 text-left transition",
                    theme.dark
                      ? "border-slate-700 bg-slate-950/50 hover:bg-slate-900"
                      : "border-slate-200 bg-white/85 hover:bg-blue-50",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p
                      className={cn(
                        "truncate text-[12px] font-semibold",
                        theme.dark ? "text-white" : "text-[#0D1B39]",
                      )}
                    >
                      {result.body || result.file_name || "Attachment"}
                    </p>
                    <span
                      className={cn(
                        "text-[10px]",
                        theme.dark ? "text-slate-500" : "text-slate-400",
                      )}
                    >
                      {formatClock(result.created_at)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className={cn(
            "rounded-[24px] border p-3",
            theme.dark
              ? "border-slate-700 bg-slate-900/55"
              : "border-slate-200 bg-white/78",
          )}
        >
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onStartCall("voice")}
              className="rounded-2xl bg-[#0A4FE8]/10 px-3 py-3 text-[#0A4FE8] text-[11px] font-bold flex flex-col items-center gap-1"
            >
              <Phone className="w-4 h-4" /> Voice
            </button>
            <button
              onClick={() => onStartCall("video")}
              className="rounded-2xl bg-[#0A4FE8]/10 px-3 py-3 text-[#0A4FE8] text-[11px] font-bold flex flex-col items-center gap-1"
            >
              <Video className="w-4 h-4" /> Video
            </button>
            {onUpload && (
              <button
                onClick={onUpload}
                className="rounded-2xl bg-[#0A4FE8]/10 px-3 py-3 text-[#0A4FE8] text-[11px] font-bold flex flex-col items-center gap-1"
              >
                <Paperclip className="w-4 h-4" /> Files
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div
              className={cn(
                "rounded-2xl px-3 py-2",
                theme.dark
                  ? "bg-slate-950/60 text-slate-300"
                  : "bg-slate-50 text-slate-600",
              )}
            >
              <span className="font-bold text-[#0A4FE8]">Invite</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="block flex-1 truncate font-mono">
                  {thread.invite_code || "none"}
                </span>
                {thread.invite_code && (
                  <button
                    onClick={copyInvite}
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold text-[#0A4FE8] hover:bg-[#0A4FE8]/10"
                  >
                    Copy
                  </button>
                )}
                {isManagement && (
                  <button
                    onClick={() => patchThread({ generateInvite: true })}
                    disabled={savingThread}
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold text-[#0A4FE8] hover:bg-[#0A4FE8]/10 disabled:opacity-50"
                  >
                    {thread.invite_code ? "New" : "Generate"}
                  </button>
                )}
              </div>
            </div>
            <div
              className={cn(
                "rounded-2xl px-3 py-2",
                theme.dark
                  ? "bg-slate-950/60 text-slate-300"
                  : "bg-slate-50 text-slate-600",
              )}
            >
              <span className="font-bold text-[#0A4FE8]">Mode</span>
              {isManagement ? (
                <select
                  value={
                    thread.is_announcement_only
                      ? "announcements"
                      : thread.visibility || "private"
                  }
                  disabled={savingThread}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "announcements")
                      patchThread({ is_announcement_only: true });
                    else
                      patchThread({
                        is_announcement_only: false,
                        visibility: v,
                      });
                  }}
                  className={cn(
                    "mt-0.5 block w-full rounded-lg bg-transparent text-[11px] font-semibold capitalize outline-none",
                    theme.dark ? "text-slate-200" : "text-slate-700",
                  )}
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                  <option value="invite_only">Invite-only</option>
                  <option value="announcements">Announcements</option>
                </select>
              ) : (
                <span className="block capitalize">
                  {thread.is_announcement_only
                    ? "announcements"
                    : thread.visibility || "private"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-10">
        {features.map((feature) => {
          const Icon = feature.icon;
          const active = activeTool === feature.label;
          return (
            <button
              key={feature.label}
              type="button"
              onClick={() => setActiveTool(active ? null : feature.label)}
              className={cn(
                "rounded-2xl border px-3 py-2.5 text-left transition",
                active
                  ? "border-[#0A4FE8] bg-[#0A4FE8]/10 ring-1 ring-[#0A4FE8]/30"
                  : theme.dark
                    ? "border-slate-700 bg-slate-900/45 hover:border-slate-600"
                    : "border-slate-200 bg-white/68 hover:border-[#0A4FE8]/40 hover:bg-blue-50/50",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-[#0A4FE8]" />
                <span
                  className={cn(
                    "text-[11px] font-bold",
                    theme.dark ? "text-white" : "text-[#0D1B39]",
                  )}
                >
                  {feature.label}
                </span>
              </div>
              <p
                className={cn(
                  "mt-1 truncate text-[10px]",
                  theme.dark ? "text-slate-500" : "text-slate-400",
                )}
              >
                {feature.state}
              </p>
            </button>
          );
        })}
      </div>

      {activeTool && (
        <CollabToolPanel
          tool={activeTool}
          thread={thread}
          theme={theme}
          viewer={viewer}
          isManagement={isManagement}
          savingThread={savingThread}
          onClose={() => setActiveTool(null)}
          onStartCall={onStartCall}
          onUpload={onUpload}
          onNewChat={onNewChat}
          patchThread={patchThread}
        />
      )}
    </div>
  );
}

interface CollabData {
  polls: any[];
  events: any[];
  files: any[];
  tasks: any[];
  calls: any[];
  pins: any[];
}

/** Stable module-level shell for a tool panel. MUST live outside CollabToolPanel
 * so it isn't re-created on every keystroke (which would remount inputs and drop
 * focus). */
function CollabToolShell({
  title,
  theme,
  loading,
  onClose,
  children,
}: {
  title: string;
  theme: (typeof CHAT_BACKGROUNDS)[ChatBackgroundKey];
  loading: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-1 rounded-[24px] border p-3",
        theme.dark
          ? "border-slate-700 bg-slate-900/40"
          : "border-slate-200 bg-white/60",
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <p
          className={cn(
            "text-[13px] font-bold",
            theme.dark ? "text-white" : "text-[#0D1B39]",
          )}
        >
          {title}
        </p>
        <button
          onClick={onClose}
          className={cn(
            "rounded-full p-1",
            theme.dark
              ? "text-slate-400 hover:bg-slate-800"
              : "text-slate-400 hover:bg-slate-100",
          )}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/** Interactive content for a selected toolkit tool. Wires the chips to the real
 * /api/team/chat/collaboration + /threads backends. */
function CollabToolPanel({
  tool,
  thread,
  theme,
  viewer,
  isManagement,
  savingThread,
  onClose,
  onStartCall,
  onUpload,
  onNewChat,
  patchThread,
}: {
  tool: string;
  thread: Thread;
  theme: (typeof CHAT_BACKGROUNDS)[ChatBackgroundKey];
  viewer: ViewerInfo | null;
  isManagement: boolean;
  savingThread: boolean;
  onClose: () => void;
  onStartCall: (kind: "voice" | "video") => void;
  onUpload?: () => void;
  onNewChat: () => void;
  patchThread: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [data, setData] = useState<CollabData>({
    polls: [],
    events: [],
    files: [],
    tasks: [],
    calls: [],
    pins: [],
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const setField = (key: string, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const [renameValue, setRenameValue] = useState(thread.name || "");

  const NEEDS_COLLAB =
    ["Files", "Tasks", "Polls", "Events", "Voice", "Security"].includes(tool) ||
    tool === "Wiki";

  const load = useCallback(async () => {
    if (!NEEDS_COLLAB) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/team/chat/collaboration?threadId=${thread.id}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (json.ok && json.collaboration) setData(json.collaboration);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [thread.id, NEEDS_COLLAB]);

  useEffect(() => {
    load();
  }, [load, tool]);

  async function createItem(kind: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/team/chat/collaboration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id, kind, ...payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok)
        throw new Error(json.error || "Could not create");
      setDraft({});
      await load();
      return true;
    } catch (error) {
      appAlert({
        title: tool,
        message: error instanceof Error ? error.message : "Action failed",
        kind: "error",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function patchCollab(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/team/chat/collaboration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id, action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Action failed");
      await load();
    } catch (error) {
      appAlert({
        title: tool,
        message: error instanceof Error ? error.message : "Action failed",
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const card = cn(
    "rounded-[20px] border p-3 sm:p-4",
    theme.dark
      ? "border-slate-700 bg-slate-900/55"
      : "border-slate-200 bg-white/85",
  );
  const inputCls = cn(
    "w-full rounded-xl border px-3 py-2 text-[13px] outline-none",
    theme.dark
      ? "border-slate-700 bg-slate-950/60 text-white placeholder:text-slate-500"
      : "border-slate-200 bg-white text-[#0D1B39] placeholder:text-slate-400",
  );
  const btnPrimary =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#0A4FE8] px-3.5 text-[12px] font-bold text-white disabled:opacity-50";
  const label = cn(
    "text-[10px] font-semibold uppercase tracking-wide",
    theme.dark ? "text-slate-500" : "text-slate-400",
  );
  const heading = cn(
    "text-[13px] font-bold",
    theme.dark ? "text-white" : "text-[#0D1B39]",
  );
  const sub = cn(
    "text-[12px]",
    theme.dark ? "text-slate-400" : "text-slate-500",
  );
  const emptyLine = cn(
    "py-6 text-center text-[12px]",
    theme.dark ? "text-slate-500" : "text-slate-400",
  );

  if (tool === "DMs") {
    return (
      <CollabToolShell
        theme={theme}
        loading={loading && NEEDS_COLLAB}
        onClose={onClose}
        title="Direct messages"
      >
        <div className={card}>
          <p className={sub}>
            Start a private one-to-one conversation with a teammate.
          </p>
          <button onClick={onNewChat} className={cn(btnPrimary, "mt-3")}>
            <Plus className="h-4 w-4" /> New direct message
          </button>
        </div>
      </CollabToolShell>
    );
  }

  if (tool === "Groups") {
    return (
      <CollabToolShell
        theme={theme}
        loading={loading && NEEDS_COLLAB}
        onClose={onClose}
        title="Group settings"
      >
        <div className={cn(card, "space-y-3")}>
          <div>
            <p className={label}>Conversation name</p>
            {isManagement ? (
              <div className="mt-1 flex gap-2">
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className={inputCls}
                  placeholder="Conversation name"
                />
                <button
                  disabled={
                    savingThread ||
                    !renameValue.trim() ||
                    renameValue.trim() === (thread.name || "")
                  }
                  onClick={() => patchThread({ name: renameValue.trim() })}
                  className={btnPrimary}
                >
                  Save
                </button>
              </div>
            ) : (
              <p className={cn("mt-1", heading)}>{thread.name || "Untitled"}</p>
            )}
          </div>
          <div className="flex gap-6">
            <div>
              <p className={label}>Visibility</p>
              <p className={cn("mt-1 capitalize", sub)}>
                {thread.visibility || "private"}
              </p>
            </div>
            <div>
              <p className={label}>Posting</p>
              <p className={cn("mt-1", sub)}>
                {thread.is_announcement_only
                  ? "Announcements only"
                  : "Everyone can post"}
              </p>
            </div>
          </div>
          {isManagement && (
            <p className={sub}>
              Change visibility and posting mode from the <b>Mode</b> tile
              above.
            </p>
          )}
        </div>
      </CollabToolShell>
    );
  }

  if (tool === "Files") {
    return (
      <CollabToolShell
        theme={theme}
        loading={loading && NEEDS_COLLAB}
        onClose={onClose}
        title="Shared files"
      >
        <div className={cn(card, "space-y-2")}>
          <p className={label}>Add a file link</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input
              value={draft.fileName || ""}
              onChange={(e) => setField("fileName", e.target.value)}
              className={inputCls}
              placeholder="Name"
            />
            <input
              value={draft.fileUrl || ""}
              onChange={(e) => setField("fileUrl", e.target.value)}
              className={inputCls}
              placeholder="Paste a shared link"
            />
            <button
              disabled={busy || !draft.fileUrl?.trim()}
              onClick={() =>
                createItem("file", {
                  fileUrl: draft.fileUrl?.trim(),
                  fileName: draft.fileName?.trim() || draft.fileUrl?.trim(),
                  folder: "Shared",
                })
              }
              className={btnPrimary}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}{" "}
              Add
            </button>
          </div>
          {onUpload && (
            <button
              onClick={onUpload}
              className={cn("text-[12px] font-semibold text-[#0A4FE8]")}
            >
              Or upload from device →
            </button>
          )}
        </div>
        <div className="mt-2 space-y-1.5">
          {data.files.length === 0 ? (
            <p className={emptyLine}>No shared files yet.</p>
          ) : (
            data.files.map((f) => (
              <a
                key={f.id}
                href={f.file_url || "#"}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 transition",
                  theme.dark
                    ? "bg-slate-950/40 hover:bg-slate-900"
                    : "bg-slate-50 hover:bg-blue-50",
                )}
              >
                <FileStack className="h-4 w-4 text-[#0A4FE8]" />
                <span
                  className={cn(
                    "flex-1 truncate text-[13px] font-medium",
                    theme.dark ? "text-white" : "text-[#0D1B39]",
                  )}
                >
                  {f.file_name || f.file_url}
                </span>
                {f.folder && <span className={label}>{f.folder}</span>}
              </a>
            ))
          )}
        </div>
      </CollabToolShell>
    );
  }

  if (tool === "Tasks") {
    return (
      <CollabToolShell
        theme={theme}
        loading={loading && NEEDS_COLLAB}
        onClose={onClose}
        title="Tasks"
      >
        <div className={cn(card, "space-y-2")}>
          <p className={label}>New task</p>
          <div className="grid gap-2 sm:grid-cols-[1.6fr_1fr_auto]">
            <input
              value={draft.taskTitle || ""}
              onChange={(e) => setField("taskTitle", e.target.value)}
              className={inputCls}
              placeholder="What needs doing?"
            />
            <input
              type="date"
              value={draft.taskDue || ""}
              onChange={(e) => setField("taskDue", e.target.value)}
              className={inputCls}
            />
            <button
              disabled={busy || !draft.taskTitle?.trim()}
              onClick={() =>
                createItem("task", {
                  title: draft.taskTitle?.trim(),
                  dueDate: draft.taskDue || null,
                  priority: "medium",
                })
              }
              className={btnPrimary}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}{" "}
              Add
            </button>
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          {data.tasks.length === 0 ? (
            <p className={emptyLine}>No tasks yet.</p>
          ) : (
            data.tasks.map((t) => {
              const done = t.status === "completed";
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2",
                    theme.dark ? "bg-slate-950/40" : "bg-slate-50",
                  )}
                >
                  <button
                    disabled={busy}
                    onClick={() =>
                      patchCollab("toggle_task", {
                        taskId: t.id,
                        status: done ? "not_started" : "completed",
                      })
                    }
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                      done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : theme.dark
                          ? "border-slate-600"
                          : "border-slate-300",
                    )}
                  >
                    {done && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <span
                    className={cn(
                      "flex-1 truncate text-[13px]",
                      done ? "line-through opacity-50" : "",
                      theme.dark ? "text-white" : "text-[#0D1B39]",
                    )}
                  >
                    {t.title}
                  </span>
                  {t.due_date && (
                    <span className={label}>
                      {formatDayDivider(t.due_date)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CollabToolShell>
    );
  }

  if (tool === "Polls") {
    return (
      <CollabToolShell
        theme={theme}
        loading={loading && NEEDS_COLLAB}
        onClose={onClose}
        title="Polls"
      >
        <div className={cn(card, "space-y-2")}>
          <p className={label}>New poll</p>
          <input
            value={draft.pollQ || ""}
            onChange={(e) => setField("pollQ", e.target.value)}
            className={inputCls}
            placeholder="Ask a question…"
          />
          <textarea
            value={draft.pollOpts || ""}
            onChange={(e) => setField("pollOpts", e.target.value)}
            className={cn(inputCls, "min-h-[64px] resize-none")}
            placeholder={"One option per line\nOption A\nOption B"}
          />
          <button
            disabled={
              busy ||
              !draft.pollQ?.trim() ||
              (draft.pollOpts || "")
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean).length < 2
            }
            onClick={() =>
              createItem("poll", {
                question: draft.pollQ?.trim(),
                options: (draft.pollOpts || "")
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            className={btnPrimary}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}{" "}
            Create poll
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {data.polls.length === 0 ? (
            <p className={emptyLine}>No polls yet.</p>
          ) : (
            data.polls.map((poll) => {
              const options: string[] = Array.isArray(poll.options)
                ? poll.options
                : [];
              const votes: Record<string, number> = poll.settings?.votes || {};
              const myVote = viewer?.reactionKey
                ? votes[viewer.reactionKey]
                : undefined;
              const total = Object.keys(votes).length;
              return (
                <div key={poll.id} className={cn(card, "space-y-2")}>
                  <p className={heading}>{poll.question}</p>
                  {options.map((opt, i) => {
                    const count = Object.values(votes).filter(
                      (v) => v === i,
                    ).length;
                    const pct = total ? Math.round((count / total) * 100) : 0;
                    const mine = myVote === i;
                    return (
                      <button
                        key={i}
                        disabled={busy}
                        onClick={() =>
                          patchCollab("vote_poll", {
                            pollId: poll.id,
                            optionIndex: i,
                          })
                        }
                        className={cn(
                          "relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-[13px]",
                          mine
                            ? "border-[#0A4FE8]"
                            : theme.dark
                              ? "border-slate-700"
                              : "border-slate-200",
                        )}
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-[#0A4FE8]/10"
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              mine ? "font-bold" : "",
                              theme.dark ? "text-white" : "text-[#0D1B39]",
                            )}
                          >
                            {opt}
                          </span>
                          <span className={label}>
                            {count} · {pct}%
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  <p className={sub}>
                    {total} vote{total === 1 ? "" : "s"}
                    {myVote != null ? " · tap your choice again to undo" : ""}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </CollabToolShell>
    );
  }

  if (tool === "Events") {
    return (
      <CollabToolShell
        theme={theme}
        loading={loading && NEEDS_COLLAB}
        onClose={onClose}
        title="Events"
      >
        <div className={cn(card, "space-y-2")}>
          <p className={label}>New event</p>
          <input
            value={draft.evTitle || ""}
            onChange={(e) => setField("evTitle", e.target.value)}
            className={inputCls}
            placeholder="Event title"
          />
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              type="datetime-local"
              value={draft.evAt || ""}
              onChange={(e) => setField("evAt", e.target.value)}
              className={inputCls}
            />
            <input
              value={draft.evLoc || ""}
              onChange={(e) => setField("evLoc", e.target.value)}
              className={inputCls}
              placeholder="Location (optional)"
            />
            <button
              disabled={busy || !draft.evTitle?.trim() || !draft.evAt}
              onClick={() =>
                createItem("event", {
                  title: draft.evTitle?.trim(),
                  startsAt: new Date(draft.evAt).toISOString(),
                  location: draft.evLoc?.trim() || null,
                })
              }
              className={btnPrimary}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}{" "}
              Add
            </button>
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          {data.events.length === 0 ? (
            <p className={emptyLine}>No events scheduled.</p>
          ) : (
            data.events.map((ev) => (
              <div
                key={ev.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2",
                  theme.dark ? "bg-slate-950/40" : "bg-slate-50",
                )}
              >
                <CalendarClock className="h-4 w-4 text-[#0A4FE8]" />
                <div className="flex-1">
                  <p
                    className={cn(
                      "text-[13px] font-medium",
                      theme.dark ? "text-white" : "text-[#0D1B39]",
                    )}
                  >
                    {ev.title}
                  </p>
                  {ev.location && <p className={label}>{ev.location}</p>}
                </div>
                {ev.starts_at && (
                  <span className={sub}>
                    {new Date(ev.starts_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </CollabToolShell>
    );
  }

  if (tool === "Voice") {
    return (
      <CollabToolShell
        theme={theme}
        loading={loading && NEEDS_COLLAB}
        onClose={onClose}
        title="Voice & video"
      >
        <div className={cn(card, "flex gap-2")}>
          <button onClick={() => onStartCall("voice")} className={btnPrimary}>
            <Phone className="h-4 w-4" /> Start voice room
          </button>
          <button
            onClick={() => onStartCall("video")}
            className={cn(btnPrimary, "bg-[#0D1B39]")}
          >
            <Video className="h-4 w-4" /> Start video room
          </button>
        </div>
        <div className="mt-2 space-y-1.5">
          <p className={label}>Recent rooms</p>
          {data.calls.length === 0 ? (
            <p className={emptyLine}>No recent calls.</p>
          ) : (
            data.calls.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2",
                  theme.dark ? "bg-slate-950/40" : "bg-slate-50",
                )}
              >
                <Mic2 className="h-4 w-4 text-[#0A4FE8]" />
                <span
                  className={cn(
                    "flex-1 text-[13px]",
                    theme.dark ? "text-white" : "text-[#0D1B39]",
                  )}
                >
                  {c.title || "cMeet room"}
                </span>
                {c.created_at && (
                  <span className={sub}>{formatClock(c.created_at)}</span>
                )}
              </div>
            ))
          )}
        </div>
      </CollabToolShell>
    );
  }

  if (tool === "Wiki") {
    return (
      <CollabToolShell
        theme={theme}
        loading={loading && NEEDS_COLLAB}
        onClose={onClose}
        title="Knowledge base"
      >
        <div className={cn(card, "space-y-2")}>
          <p className={label}>Add a note</p>
          <input
            value={draft.wikiTitle || ""}
            onChange={(e) => setField("wikiTitle", e.target.value)}
            className={inputCls}
            placeholder="Title"
          />
          <textarea
            value={draft.wikiBody || ""}
            onChange={(e) => setField("wikiBody", e.target.value)}
            className={cn(inputCls, "min-h-[64px] resize-none")}
            placeholder="Write something the team should remember…"
          />
          <button
            disabled={busy || !draft.wikiTitle?.trim()}
            onClick={() =>
              createItem("ai_artifact", {
                artifactType: "note",
                title: draft.wikiTitle?.trim(),
                summary: draft.wikiBody?.trim() || null,
              })
            }
            className={btnPrimary}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}{" "}
            Save note
          </button>
        </div>
      </CollabToolShell>
    );
  }

  if (tool === "Security") {
    return (
      <CollabToolShell
        theme={theme}
        loading={loading && NEEDS_COLLAB}
        onClose={onClose}
        title="Security & pins"
      >
        <div className={cn(card, "space-y-2")}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className={label}>Visibility</p>
              <p
                className={cn(
                  "mt-0.5 text-[13px] font-bold capitalize",
                  heading,
                )}
              >
                {thread.visibility || "private"}
              </p>
            </div>
            <div>
              <p className={label}>Posting</p>
              <p className={cn("mt-0.5 text-[13px] font-bold", heading)}>
                {thread.is_announcement_only ? "Locked" : "Open"}
              </p>
            </div>
            <div>
              <p className={label}>Invite</p>
              <p className={cn("mt-0.5 text-[13px] font-bold", heading)}>
                {thread.invite_code ? "Active" : "Off"}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          <p className={label}>Pinned messages</p>
          {data.pins.length === 0 ? (
            <p className={emptyLine}>Nothing pinned.</p>
          ) : (
            data.pins.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2",
                  theme.dark ? "bg-slate-950/40" : "bg-slate-50",
                )}
              >
                <Pin className="h-4 w-4 text-[#0A4FE8]" />
                <span
                  className={cn(
                    "flex-1 truncate text-[13px]",
                    theme.dark ? "text-white" : "text-[#0D1B39]",
                  )}
                >
                  {p.body || "Attachment"}
                </span>
                {p.pinned_at && (
                  <span className={sub}>{formatClock(p.pinned_at)}</span>
                )}
              </div>
            ))
          )}
        </div>
      </CollabToolShell>
    );
  }

  return null;
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
  onPin,
  onStar,
  onBookmark,
  onTranslate,
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
  onPin: () => void;
  onStar: () => void;
  onBookmark: () => void;
  onTranslate?: () => void;
  onJumpToReply?: () => void;
  onReact: (emoji: string) => void;
}) {
  return (
    <ViewportPortal>
      <div
        className="fixed inset-0 z-[160] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm md:items-center md:p-4"
        onClick={onClose}
      >
        <div
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border px-4 pb-5 pt-3 shadow-2xl md:max-w-md md:rounded-[28px]"
        style={{
          background: theme.dark
            ? "rgba(2,6,23,0.96)"
            : "rgba(255,255,255,0.98)",
          borderColor: theme.dark
            ? "rgba(71,85,105,0.72)"
            : "rgba(226,232,240,0.8)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="h-1.5 w-12 rounded-full bg-slate-300/70 md:hidden" />
          <p className={cn("hidden text-sm font-semibold md:block", theme.dark ? "text-white" : "text-[#0D1B39]")}>Message actions</p>
          <button type="button" onClick={onClose} className={cn("grid h-9 w-9 place-items-center rounded-xl", theme.dark ? "text-slate-300 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100")} aria-label="Close message actions">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className={cn(
            "rounded-[22px] border px-4 py-3 mb-4",
            theme.dark
              ? "border-slate-700 bg-slate-900/70"
              : "border-slate-200 bg-slate-50/90",
          )}
        >
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.24em]",
              theme.dark ? "text-slate-400" : "text-slate-500",
            )}
          >
            Selected message
          </p>
          <p
            className={cn(
              "text-[13px] mt-1 line-clamp-3",
              theme.dark ? "text-white" : "text-[#0D1B39]",
            )}
          >
            {describeMessage(message)}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 mb-4">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              className={cn(
                "flex-1 h-11 rounded-2xl text-xl border",
                theme.dark
                  ? "bg-slate-900 border-slate-700"
                  : "bg-slate-50 border-slate-200",
              )}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <UniversalShareButton
            title={`Message from ${message.sender_name}`}
            text={describeMessage(message)}
            chatText={describeMessage(message)}
            url="/"
            label="Share message"
            className={cn(
              "!min-h-0 !w-full !justify-start !rounded-2xl !border-0 !px-4 !py-3 !text-sm !font-medium !shadow-none",
              theme.dark
                ? "!bg-slate-900 !text-white hover:!bg-slate-800"
                : "!bg-slate-50 !text-[#0D1B39] hover:!bg-slate-100",
            )}
          />
          {onJumpToReply && (
            <button
              onClick={onJumpToReply}
              className={cn(
                "w-full rounded-2xl px-4 py-3 flex items-center gap-3",
                theme.dark
                  ? "bg-slate-900 text-white"
                  : "bg-slate-50 text-[#0D1B39]",
              )}
            >
              <CornerDownRight className="w-4 h-4" /> View replied message
            </button>
          )}
          <button
            onClick={onReply}
            className={cn(
              "w-full rounded-2xl px-4 py-3 flex items-center gap-3",
              theme.dark
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-[#0D1B39]",
            )}
          >
            <Reply className="w-4 h-4" /> Reply
          </button>
          {canEdit && (
            <button
              onClick={onEdit}
              className={cn(
                "w-full rounded-2xl px-4 py-3 flex items-center gap-3",
                theme.dark
                  ? "bg-slate-900 text-white"
                  : "bg-slate-50 text-[#0D1B39]",
              )}
            >
              <Pencil className="w-4 h-4" /> Edit message
            </button>
          )}
          <button
            onClick={onForward}
            className={cn(
              "w-full rounded-2xl px-4 py-3 flex items-center gap-3",
              theme.dark
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-[#0D1B39]",
            )}
          >
            <Forward className="w-4 h-4" /> Forward
          </button>
          <button
            onClick={onPin}
            className={cn(
              "w-full rounded-2xl px-4 py-3 flex items-center gap-3",
              theme.dark
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-[#0D1B39]",
            )}
          >
            <Pin className="w-4 h-4" />{" "}
            {message.pinned_at ? "Unpin message" : "Pin message"}
          </button>
          <button
            onClick={onStar}
            className={cn(
              "w-full rounded-2xl px-4 py-3 flex items-center gap-3",
              theme.dark
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-[#0D1B39]",
            )}
          >
            <Star className="w-4 h-4" /> Star message
          </button>
          <button
            onClick={onBookmark}
            className={cn(
              "w-full rounded-2xl px-4 py-3 flex items-center gap-3",
              theme.dark
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-[#0D1B39]",
            )}
          >
            <Bookmark className="w-4 h-4" /> Bookmark
          </button>
          {onTranslate && (
            <button
              onClick={onTranslate}
              className={cn(
                "w-full rounded-2xl px-4 py-3 flex items-center gap-3",
                theme.dark
                  ? "bg-slate-900 text-white"
                  : "bg-slate-50 text-[#0D1B39]",
              )}
            >
              <Languages className="w-4 h-4" /> Translate
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 bg-rose-50 text-rose-600"
            >
              <Trash2 className="w-4 h-4" /> Delete message
            </button>
          )}
        </div>
        </div>
      </div>
    </ViewportPortal>
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
      if (!res.ok || !json.ok)
        setError(json.error || "Couldn't forward that message");
      else onDone();
    } catch {
      setError("Network error");
    } finally {
      setForwarding(false);
    }
  }

  const teamFiltered = teamThreads.filter((thread) =>
    (thread.name || "").toLowerCase().includes(search.toLowerCase()),
  );
  const clientFiltered = clientRooms.filter((room) =>
    (room.client?.full_name || room.client?.email || "")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-[#0D1B39]">
              Forward message
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">
              Original: {message.body || "Attachment"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-50 transition"
          >
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
                  mode === "team"
                    ? "bg-white text-[#0A4FE8] shadow-sm"
                    : "text-gray-400 hover:text-gray-600",
                )}
              >
                Team Threads
              </button>
              <button
                onClick={() => setMode("client")}
                className={cn(
                  "flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition",
                  mode === "client"
                    ? "bg-white text-[#0A4FE8] shadow-sm"
                    : "text-gray-400 hover:text-gray-600",
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
              {teamFiltered.length === 0 && (
                <p className="p-8 text-center text-xs text-gray-400">
                  No threads found
                </p>
              )}
              {teamFiltered.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => forward("team", thread.id)}
                  disabled={forwarding}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100/50 text-[#0A4FE8] flex items-center justify-center shrink-0">
                    {thread.kind === "department" ? (
                      <Hash className="w-4 h-4" />
                    ) : thread.kind === "group" ? (
                      <UsersIcon className="w-4 h-4" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>
                  <span className="text-[13px] text-[#0D1B39] font-medium group-hover:text-[#0A4FE8] transition capitalize">
                    {thread.name ||
                      (thread.kind === "direct" ? "User" : "Untitled")}
                  </span>
                  {forwarding && (
                    <Loader2 className="w-3 h-3 animate-spin ml-auto text-blue-300" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {clientFiltered.length === 0 && (
                <p className="p-8 text-center text-xs text-gray-400">
                  No clients found
                </p>
              )}
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
                      {room.client?.full_name ||
                        room.client?.email ||
                        "Unknown Client"}
                    </span>
                    <span className="text-[10px] text-gray-400 truncate w-full">
                      {room.client?.email}
                    </span>
                  </div>
                  {forwarding && (
                    <Loader2 className="w-3 h-3 animate-spin ml-auto text-emerald-300" />
                  )}
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
  viewerKind,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  viewerKind: "admin" | "team";
}) {
  const [loading, setLoading] = useState(false);
  const canCreateGroup = viewerKind === "admin";
  const [kind, setKind] = useState<NewChatKind>("direct");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [projectId, setProjectId] = useState("");
  const [visibility, setVisibility] = useState<
    "public" | "private" | "invite_only"
  >("private");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [announcementOnly, setAnnouncementOnly] = useState(false);
  const [members, setMembers] = useState<ChatMemberOption[]>([]);
  const [projects, setProjects] = useState<ChatProjectOption[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/team/chat/members", {
        credentials: "include",
      });
      const json = await res.json();
      if (json.ok) setMembers(json.members);
    })();
    if (viewerKind === "admin") {
      (async () => {
        const res = await fetch("/api/admin/finance/projects", {
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(json.projects)) setProjects(json.projects);
      })().catch(() => {});
    }
  }, [viewerKind]);

  const filtered = members.filter((member) =>
    (member.full_name || member.username || "")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const departments = Array.from(
    new Set(
      members
        .map((member) => member.department)
        .filter((d): d is string => !!d),
    ),
  ).sort();

  async function create() {
    if (kind === "group" && !name.trim()) {
      setError("Group name is required");
      return;
    }
    if (kind === "department" && !department.trim()) {
      setError("Select a department");
      return;
    }
    if (kind === "project" && !projectId.trim()) {
      setError("Select a project");
      return;
    }
    if ((kind === "direct" || kind === "group") && selectedIds.length === 0) {
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
          name: kind === "group" || kind === "project" ? name : null,
          department: kind === "department" ? department : null,
          project_id: kind === "project" ? projectId : null,
          participant_ids: selectedIds,
          visibility,
          description,
          rules,
          is_announcement_only: announcementOnly,
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
    else
      setSelectedIds((prev) =>
        prev.includes(id)
          ? prev.filter((value) => value !== id)
          : [...prev, id],
      );
  }

  function switchKind(next: NewChatKind) {
    if (next !== "direct" && next !== "self" && !canCreateGroup) return;
    setKind(next);
    setError(null);
    if (next === "direct") setSelectedIds(selectedIds.slice(0, 1));
    if (next === "self") setSelectedIds([]);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-[#0D1B39]">
            Start new conversation
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-50 transition"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1 overflow-y-auto">
          <div
            className={cn(
              "grid grid-cols-2 gap-1.5 bg-gray-50 p-1.5 rounded-2xl",
              canCreateGroup ? "sm:grid-cols-5" : "sm:grid-cols-2",
            )}
          >
            <button
              onClick={() => switchKind("self")}
              className={cn(
                "py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-xl transition",
                kind === "self"
                  ? "bg-white text-[#0A4FE8] shadow-sm"
                  : "text-gray-400 hover:text-gray-600",
              )}
            >
              Saved
            </button>
            <button
              onClick={() => switchKind("direct")}
              className={cn(
                "py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-xl transition",
                kind === "direct"
                  ? "bg-white text-[#0A4FE8] shadow-sm"
                  : "text-gray-400 hover:text-gray-600",
              )}
            >
              Direct
            </button>
            {canCreateGroup && (
              <>
                <button
                  onClick={() => switchKind("group")}
                  className={cn(
                    "py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-xl transition",
                    kind === "group"
                      ? "bg-white text-[#0A4FE8] shadow-sm"
                      : "text-gray-400 hover:text-gray-600",
                  )}
                >
                  Group
                </button>
                <button
                  onClick={() => switchKind("department")}
                  className={cn(
                    "py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-xl transition",
                    kind === "department"
                      ? "bg-white text-[#0A4FE8] shadow-sm"
                      : "text-gray-400 hover:text-gray-600",
                  )}
                >
                  Dept
                </button>
                <button
                  onClick={() => switchKind("project")}
                  className={cn(
                    "py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-xl transition",
                    kind === "project"
                      ? "bg-white text-[#0A4FE8] shadow-sm"
                      : "text-gray-400 hover:text-gray-600",
                  )}
                >
                  Project
                </button>
              </>
            )}
          </div>

          {(kind === "group" || kind === "project") && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">
                {kind === "project" ? "Channel Name" : "Group Name"}
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={
                  kind === "project"
                    ? "Optional, defaults to project name"
                    : "Marketing Strategy, Project Alpha, etc."
                }
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-transparent focus:ring-2 focus:ring-blue-100 focus:bg-white focus:border-blue-200 transition text-[13px]"
              />
            </div>
          )}

          {canCreateGroup &&
            (kind === "group" ||
              kind === "department" ||
              kind === "project") && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">
                    Visibility
                  </label>
                  <select
                    value={visibility}
                    onChange={(event) =>
                      setVisibility(
                        event.target.value as
                          "public" | "private" | "invite_only",
                      )
                    }
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-transparent focus:ring-2 focus:ring-blue-100 focus:bg-white focus:border-blue-200 transition text-[13px]"
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                    <option value="invite_only">Invite-only</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 text-[13px] font-semibold text-[#0D1B39]">
                  <input
                    type="checkbox"
                    checked={announcementOnly}
                    onChange={(event) =>
                      setAnnouncementOnly(event.target.checked)
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Announcements
                </label>
              </div>
            )}

          {canCreateGroup &&
            (kind === "group" ||
              kind === "department" ||
              kind === "project") && (
              <div className="grid gap-3">
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Group description"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-transparent focus:ring-2 focus:ring-blue-100 focus:bg-white focus:border-blue-200 transition text-[13px] resize-none"
                />
                <textarea
                  value={rules}
                  onChange={(event) => setRules(event.target.value)}
                  placeholder="Group rules"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-transparent focus:ring-2 focus:ring-blue-100 focus:bg-white focus:border-blue-200 transition text-[13px] resize-none"
                />
              </div>
            )}

          {kind === "department" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">
                Department
              </label>
              <select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-transparent focus:ring-2 focus:ring-blue-100 focus:bg-white focus:border-blue-200 transition text-[13px]"
              >
                <option value="">Select department</option>
                {departments.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          )}

          {kind === "project" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">
                Project
              </label>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-transparent focus:ring-2 focus:ring-blue-100 focus:bg-white focus:border-blue-200 transition text-[13px]"
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-3">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">
              {kind === "department" || kind === "project"
                ? "Additional Participants"
                : `Select ${kind === "direct" ? "Person" : "Participants"}`}
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
                    selectedIds.includes(member.id)
                      ? "bg-blue-50 border-[#0A4FE8]/20"
                      : "bg-white border-transparent hover:bg-gray-50",
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center font-bold text-xs uppercase">
                    {initials(member.full_name || member.username)}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 truncate text-[13px] font-semibold text-[#0D1B39]">
                        {member.full_name}
                      </p>
                      <StatusBadge status={member.status} />
                    </div>
                    <p className="text-[11px] text-gray-400 truncate">
                      @{member.username} ·{" "}
                      {member.role_title || member.department || "Team"}
                    </p>
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
          {error && (
            <p className="text-rose-500 text-xs font-semibold text-center">
              {error}
            </p>
          )}
          <button
            onClick={create}
            disabled={loading}
            className="w-full h-12 bg-[#0A4FE8] text-white rounded-xl font-semibold text-[14px] shadow-lg shadow-[#0A4FE8]/20 hover:bg-[#083EC0] transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Start Chat"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status?: "online" | "offline" | "break" | string | null;
}) {
  const normalized =
    status === "break" || status === "online" ? status : "offline";
  const label =
    normalized === "break"
      ? "Break"
      : normalized === "online"
        ? "Online"
        : "Offline";
  const classes =
    normalized === "online"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : normalized === "break"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-slate-100 text-slate-500 ring-slate-200";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1",
        classes,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          normalized === "online"
            ? "bg-emerald-500"
            : normalized === "break"
              ? "bg-amber-500"
              : "bg-slate-400",
        )}
      />
      {label}
    </span>
  );
}
