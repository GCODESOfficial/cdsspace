"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { Bell, Check, Loader2 } from "lucide-react";

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  thread_id: string | null;
  created_at: string;
  read_at: string | null;
}

interface NotificationGroup {
  /** Stable key for grouping - thread_id if present, otherwise kind+title. */
  key: string;
  /** Newest notification - used for the headline + click target. */
  primary: Notification;
  /** All notifications in the group, newest first. */
  items: Notification[];
  unreadCount: number;
}

function groupNotifications(items: Notification[]): NotificationGroup[] {
  const map = new Map<string, NotificationGroup>();
  for (const n of items) {
    // Group by thread whenever the notification is thread-bound (e.g. every
    // "New message in #Family House" row shares the same thread_id). Fall
    // back to kind+title so sub_admin_granted, project_assigned, etc. don't
    // get stapled together just because they're thread-less.
    const key = n.thread_id
      ? `thread:${n.thread_id}`
      : `kind:${n.kind}:${n.title}`;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(n);
      if (!n.read_at) existing.unreadCount += 1;
    } else {
      map.set(key, { key, primary: n, items: [n], unreadCount: n.read_at ? 0 : 1 });
    }
  }
  // Keep the insertion order (items arrive newest-first from the API),
  // which is also the order each group's `primary` was set in.
  return Array.from(map.values());
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevUnreadCount = useRef<number>(0);
  const isFirstLoad = useRef<boolean>(true);

  const playNotificationSound = useCallback(() => {
    const audio = new Audio("/special-notification.mp3");
    audio.volume = 0.7; // Team members get a special volume
    audio.play().catch((err) => console.log("Audio playback failed:", err));
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team/notifications", { credentials: "include" });
      const json = await res.json();
      if (res.ok && json.ok) {
        const newItems = json.notifications;
        const newUnreadCount = newItems.filter((n: Notification) => !n.read_at).length;
        
        if (!isFirstLoad.current && newUnreadCount > prevUnreadCount.current) {
          playNotificationSound();
        }
        
        prevUnreadCount.current = newUnreadCount;
        isFirstLoad.current = false;
        setItems(newItems);
      }
    } finally {
      setLoading(false);
    }
  }, [playNotificationSound]);

  useEffect(() => {
    fetchNotifications();
    const t = setInterval(() => { if (!document.hidden) fetchNotifications(); }, 30_000);
    return () => clearInterval(t);
  }, [fetchNotifications]);

  const unread = items.filter((n) => !n.read_at);
  const groups = useMemo(() => groupNotifications(items), [items]);

  async function markAllRead() {
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    await fetch("/api/team/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
      credentials: "include",
    });
    fetchNotifications();
  }

  // Mark every notification inside a group as read - fired when the user
  // clicks the group header. Optimistic so the badge drops immediately and
  // doesn't wait for the 30s poll.
  async function markGroupRead(group: NotificationGroup) {
    const unreadIds = group.items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const nowIso = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: nowIso } : n)),
    );
    try {
      await fetch("/api/team/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
        credentials: "include",
      });
    } catch {
      /* optimistic update already applied */
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl bg-white border border-brand-stroke/40 text-brand-navy hover:border-brand-blue/40 hover:text-brand-blue transition"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-[#040B37]/10 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <div className="fixed left-3 right-3 top-[4.75rem] z-50 flex max-h-[min(72dvh,calc(100dvh-6rem))] flex-col overflow-hidden rounded-[24px] border border-brand-stroke/40 bg-white shadow-xl md:absolute md:left-auto md:right-0 md:top-auto md:mt-2 md:w-[380px] md:max-h-[480px] md:rounded-2xl">
            <div className="flex flex-col gap-2 px-4 py-3 border-b border-brand-stroke/30 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-brand-navy text-[18px] leading-tight">Notifications</p>
              {unread.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-[12px] text-brand-blue hover:underline"
                >
                  <Check className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-brand-stroke/20">
              {loading && items.length === 0 ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
                </div>
              ) : items.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="w-8 h-8 text-brand-stroke mx-auto mb-3" />
                  <p className="text-[13px] text-brand-body/60">You&apos;re all caught up</p>
                </div>
              ) : (
                groups.map((g) => (
                  <NotificationGroupRow
                    key={g.key}
                    group={g}
                    onMarkRead={() => markGroupRead(g)}
                    onNavigate={() => setOpen(false)}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One row per group. Clicking a notification ALWAYS navigates straight to
 * where the message lives (the newest item's link - a chat thread, project,
 * announcement, etc.) and marks the whole group read, so the unread dot + bell
 * badge drop instantly. A count badge still shows when several notifications
 * share the same destination.
 */
function NotificationGroupRow({
  group,
  onMarkRead,
  onNavigate,
}: {
  group: NotificationGroup;
  onMarkRead: () => void;
  onNavigate: () => void;
}) {
  const { primary, items, unreadCount } = group;
  const groupUnread = unreadCount > 0;

  const headerClasses = `block px-4 py-3 hover:bg-brand-bg/60 transition cursor-pointer ${
    groupUnread ? "bg-brand-blue/[0.03]" : ""
  }`;

  const handleClick = () => {
    void onMarkRead();
    onNavigate();
  };

  const header = (
    <div className={headerClasses} onClick={handleClick}>
      <div className="flex items-start gap-3">
        {groupUnread && <span className="w-1.5 h-1.5 rounded-full bg-brand-blue mt-1.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold leading-5 text-brand-navy break-words">
              {primary.title}
            </p>
            {/* Count reflects UNREAD messages in the group, so clicking the row
                (which marks the group read) clears the tag instead of leaving a
                stale total behind. */}
            {unreadCount > 1 && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
                {unreadCount}
              </span>
            )}
          </div>
          {primary.body && (
            <p className="text-[12px] text-brand-body/70 truncate mt-0.5">{primary.body}</p>
          )}
          <p className="text-[10px] text-brand-body/50 mt-1">
            {new Date(primary.created_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );

  // Always wrap in a Link so the click opens the destination directly.
  return primary.link ? (
    <Link href={primary.link} onClick={onNavigate}>
      {header}
    </Link>
  ) : (
    header
  );
}
