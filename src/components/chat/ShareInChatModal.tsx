"use client";

/**
 * Reusable "Share in chat" modal.
 *
 * Used as the in-app destination picker behind the universal share system.
 * It supports team groups, team-member DMs, admin-to-client conversations,
 * and the signed-in client's own support/project chats.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Users, User, ArrowLeft, X, Check, MessageSquarePlus, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { cn, initials } from "@/lib/utils";

type Thread = {
  id: string;
  kind: "direct" | "group" | "department" | "admin_broadcast";
  name: string | null;
  department: string | null;
  project_id?: string | null;
};

type Member = {
  id: string;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  role_title?: string | null;
  department?: string | null;
  status?: string;
};

type ClientDestination = {
  id: string;
  channel: "direct" | "project";
  name: string;
  subtitle: string;
};

type Mode = "choose" | "group" | "member" | "client";

export function ShareInChatModal({
  open,
  onClose,
  shareText,
  title = "Share in chat",
  clientTarget,
}: {
  open: boolean;
  onClose: () => void;
  /** The composed message (link + context) to post into the chosen chat. */
  shareText: string;
  /** What is being shared, shown in the header (e.g. "Invoice INV-1024"). */
  title?: string;
  /** Optional receiving client, used even when their chat has no messages yet. */
  clientTarget?: { id: string; name: string } | null;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [clientDestinations, setClientDestinations] = useState<ClientDestination[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("choose");
    setSearch("");
    setSendingTo(null);
  }, [open]);

  // Lazily load the relevant list when a mode is entered.
  useEffect(() => {
    if (!open || mode === "choose") return;
    let cancelled = false;
    setLoading(true);
    const request = mode === "client"
      ? loadClientDestinations(clientTarget)
      : fetch(mode === "group" ? "/api/team/chat/threads" : "/api/team/chat/members", { credentials: "include" })
          .then((response) => response.json())
          .then((json) => ({ mode, json }));
    request
      .then((result) => {
        if (cancelled) return;
        if (mode === "client") {
          setClientDestinations((result as { destinations: ClientDestination[] }).destinations);
          return;
        }
        const json = (result as { json: Record<string, unknown> }).json;
        if (!json.ok) return;
        if (mode === "group") setThreads((json.threads as Thread[]) || []);
        else setMembers((json.members as Member[]) || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientTarget, open, mode]);

  // Group chats = department channels, group chats, and project group chats.
  const groupThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads
      .filter((t) => t.kind === "group" || t.kind === "department" || !!t.project_id)
      .filter((t) => !q || (t.name || t.department || "").toLowerCase().includes(q));
  }, [threads, search]);

  const memberMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => !q || [m.full_name, m.username, m.department].some((v) => (v || "").toLowerCase().includes(q)));
  }, [members, search]);

  const clientMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clientDestinations.filter((destination) => !q || `${destination.name} ${destination.subtitle}`.toLowerCase().includes(q));
  }, [clientDestinations, search]);

  async function postToThread(threadId: string) {
    const res = await fetch("/api/team/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ threadId, body: shareText }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || "Couldn't send to that chat.");
  }

  async function shareToThread(thread: Thread) {
    setSendingTo(thread.id);
    try {
      await postToThread(thread.id);
      toast.success(`Shared to ${thread.name || thread.department || "the chat"}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't share to chat.");
    } finally {
      setSendingTo(null);
    }
  }

  async function shareToMember(member: Member) {
    setSendingTo(member.id);
    try {
      // Reuse an existing 1:1 DM with this member if we can find one, otherwise
      // open a fresh direct thread. (Direct threads resolve `name` to the other
      // participant, so we match on that.)
      let threadId: string | null = null;
      const label = (member.full_name || member.username || "").toLowerCase();
      try {
        const tr = await fetch("/api/team/chat/threads", { credentials: "include" }).then((r) => r.json());
        if (tr.ok) {
          const existing = (tr.threads as Thread[]).find(
            (t) => t.kind === "direct" && !t.project_id && (t.name || "").toLowerCase() === label,
          );
          threadId = existing?.id ?? null;
        }
      } catch { /* fall through to create */ }

      if (!threadId) {
        const created = await fetch("/api/team/chat/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ kind: "direct", participant_ids: [member.id] }),
        }).then((r) => r.json());
        if (!created.ok || !created.thread_id) throw new Error(created.error || "Couldn't open a chat with that member.");
        threadId = created.thread_id as string;
      }

      if (!threadId) throw new Error("Couldn't open a chat with that member.");
      await postToThread(threadId);
      toast.success(`Shared to ${member.full_name || member.username}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't share to member.");
    } finally {
      setSendingTo(null);
    }
  }

  async function shareToClient(destination: ClientDestination) {
    setSendingTo(destination.id);
    try {
      const isAdminSurface = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
      const endpoint = destination.channel === "project" ? "/api/client/chat/project/messages" : "/api/chat/messages";
      const payload = destination.channel === "project"
        ? { threadId: destination.id, body: shareText }
        : { roomId: destination.id, message: shareText, ...(isAdminSurface ? {} : { actor: "client" }) };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.error || json.ok === false) throw new Error(json.error || "Couldn't share to that Chat/Meet conversation.");
      toast.success(`Shared to ${destination.name}`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't share to Chat/Meet.");
    } finally {
      setSendingTo(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          {mode !== "choose" && (
            <button
              onClick={() => { setMode("choose"); setSearch(""); }}
              className="p-1.5 -ml-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-[#0D1B39] truncate">{title}</h3>
            <p className="text-[12px] text-gray-500">
              {mode === "choose" ? "Share this into a chat" : mode === "group" ? "Pick a group chat" : mode === "member" ? "Pick a team member" : "Pick a client conversation"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {mode === "choose" ? (
          <div className="p-5 space-y-3">
            <button
              onClick={() => setMode("group")}
              className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition text-left"
            >
              <span className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 grid place-items-center shrink-0">
                <Users className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-[#0D1B39]">Group chat</span>
                <span className="block text-[12px] text-gray-500">A department or project group chat</span>
              </span>
            </button>
            <button
              onClick={() => setMode("client")}
              className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition text-left"
            >
              <span className="w-11 h-11 rounded-2xl bg-violet-100 text-violet-700 grid place-items-center shrink-0">
                <MessagesSquare className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-[#0D1B39]">Chat/Meet</span>
                <span className="block text-[12px] text-gray-500">A client support or project conversation</span>
              </span>
            </button>
            <button
              onClick={() => setMode("member")}
              className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition text-left"
            >
              <span className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 grid place-items-center shrink-0">
                <User className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-[#0D1B39]">A single team member</span>
                <span className="block text-[12px] text-gray-500">Send it to one person's DM</span>
              </span>
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={mode === "group" ? "Search group chats…" : mode === "member" ? "Search members…" : "Search Chat/Meet conversations…"}
                  className="flex-1 bg-transparent outline-none text-[13px]"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : mode === "group" ? (
                groupThreads.length === 0 ? (
                  <EmptyRow label="No group chats found." />
                ) : (
                  groupThreads.map((t) => (
                    <PickRow
                      key={t.id}
                      busy={sendingTo === t.id}
                      onClick={() => shareToThread(t)}
                      icon={<Users className="w-4 h-4" />}
                      title={t.name || t.department || "Group chat"}
                      subtitle={t.project_id ? "Project group" : t.kind === "department" ? "Department" : "Group"}
                    />
                  ))
                )
              ) : mode === "member" ? memberMatches.length === 0 ? (
                <EmptyRow label="No members found." />
              ) : (
                memberMatches.map((m) => (
                  <PickRow
                    key={m.id}
                    busy={sendingTo === m.id}
                    onClick={() => shareToMember(m)}
                    avatar={m.avatar_url}
                    fallback={initials(m.full_name || m.username || "?")}
                    title={m.full_name || m.username || "Member"}
                    subtitle={m.role_title || m.department || undefined}
                    online={m.status === "online"}
                  />
                ))
              ) : clientMatches.length === 0 ? (
                <EmptyRow label="No client conversations are available for this account." />
              ) : (
                clientMatches.map((destination) => (
                  <PickRow
                    key={`${destination.channel}:${destination.id}`}
                    busy={sendingTo === destination.id}
                    onClick={() => shareToClient(destination)}
                    icon={<MessagesSquare className="w-4 h-4" />}
                    title={destination.name}
                    subtitle={destination.subtitle}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

async function loadClientDestinations(clientTarget?: { id: string; name: string } | null) {
  const destinations = new Map<string, ClientDestination>();
  if (clientTarget?.id) {
    destinations.set(`direct:client_${clientTarget.id}`, {
      id: `client_${clientTarget.id}`,
      channel: "direct",
      name: clientTarget.name || "Client",
      subtitle: "Direct client conversation",
    });
  }

  const [directResult, projectResult] = await Promise.allSettled([
    fetch("/api/chat/rooms", { credentials: "include", cache: "no-store" }).then((response) => response.ok ? response.json() : null),
    fetch("/api/client/chat/threads", { credentials: "include", cache: "no-store" }).then((response) => response.ok ? response.json() : null),
  ]);

  if (directResult.status === "fulfilled") {
    for (const room of directResult.value?.rooms || []) {
      if (!String(room.roomId || "").startsWith("client_")) continue;
      const name = room.client?.full_name || room.client?.email || (room.roomId === `client_${room.client?.id}` ? "Client" : "CDS Space support");
      destinations.set(`direct:${room.roomId}`, { id: room.roomId, channel: "direct", name, subtitle: "Direct client conversation" });
    }
  }
  if (projectResult.status === "fulfilled" && projectResult.value?.ok) {
    for (const thread of projectResult.value.threads || []) {
      const channel = thread.kind === "project" ? "project" : "direct";
      destinations.set(`${channel}:${thread.id}`, {
        id: thread.id,
        channel,
        name: thread.name || (thread.kind === "project" ? "Project chat" : "CDS Space support"),
        subtitle: thread.kind === "project" ? "Client project conversation" : "Direct client conversation",
      });
    }
  }
  return { destinations: Array.from(destinations.values()) };
}

function PickRow({
  onClick, busy, title, subtitle, icon, avatar, fallback, online,
}: {
  onClick: () => void;
  busy?: boolean;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  avatar?: string | null;
  fallback?: string;
  online?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition text-left disabled:opacity-60"
    >
      <span className={cn(
        "w-9 h-9 rounded-full grid place-items-center text-[11px] font-bold shrink-0 overflow-hidden",
        icon ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700",
      )}>
        {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : icon || fallback}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-[#0D1B39] truncate">{title}</span>
        {subtitle && <span className="block text-[11.5px] text-gray-400 truncate">{subtitle}</span>}
      </span>
      {busy ? <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
        : online ? <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        : <MessageSquarePlus className="w-4 h-4 text-gray-300 shrink-0" />}
    </button>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <Check className="w-6 h-6 text-gray-300 mb-2" />
      <p className="text-[13px] text-gray-400">{label}</p>
    </div>
  );
}
