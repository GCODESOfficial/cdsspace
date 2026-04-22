"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, Loader2 } from "lucide-react";

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const res = await fetch("/api/team/notifications", { credentials: "include" });
      const json = await res.json();
      if (res.ok && json.ok) setItems(json.notifications);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNotifications();
    const t = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(t);
  }, []);

  const unread = items.filter((n) => !n.read_at);

  async function markAllRead() {
    await fetch("/api/team/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
      credentials: "include",
    });
    fetchNotifications();
  }

  return (
    <div className="relative">
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
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[380px] max-h-[480px] overflow-hidden rounded-2xl bg-white border border-brand-stroke/40 shadow-xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-stroke/30">
              <p className="font-semibold text-brand-navy text-sm">Notifications</p>
              {unread.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[12px] text-brand-blue hover:underline inline-flex items-center gap-1"
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
                  <p className="text-[13px] text-brand-body/60">You're all caught up</p>
                </div>
              ) : (
                items.map((n) => (
                  <NotificationItem key={n.id} n={n} onClick={() => setOpen(false)} />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationItem({ n, onClick }: { n: Notification; onClick: () => void }) {
  const body = (
    <div
      className={`block px-4 py-3 hover:bg-brand-bg/60 transition ${
        !n.read_at ? "bg-brand-blue/[0.03]" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-brand-blue mt-1.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-brand-navy truncate">{n.title}</p>
          {n.body && <p className="text-[12px] text-brand-body/70 line-clamp-2 mt-0.5">{n.body}</p>}
          <p className="text-[10px] text-brand-body/50 mt-1">
            {new Date(n.created_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
  return n.link ? (
    <Link href={n.link} onClick={onClick}>
      {body}
    </Link>
  ) : (
    <div onClick={onClick}>{body}</div>
  );
}
