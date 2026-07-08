"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import NotificationItem, { type Notification } from "./notification-item";

const POLL_INTERVAL = 10_000;
const MAX_DISPLAY = 10;

export default function AdminNotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevUnreadCount = useRef<number>(0);
  const isFirstLoad = useRef<boolean>(true);

  // ---------- Play Sound ----------
  const playNotificationSound = useCallback(() => {
    const audio = new Audio("/special-notification.mp3");
    audio.volume = 0.8; // Admins get it slightly louder
    audio.play().catch((err) => console.log("Audio playback failed:", err));
  }, []);

  // ---------- Fetch ----------
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/notifications?unreadOnly=true&limit=${MAX_DISPLAY}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const newNotifications = data.notifications || [];
      
      const newUnreadCount = newNotifications.filter((n: Notification) => !n.is_read).length;
      
      if (!isFirstLoad.current && newUnreadCount > prevUnreadCount.current) {
        playNotificationSound();
      }
      
      prevUnreadCount.current = newUnreadCount;
      isFirstLoad.current = false;
      setNotifications(newNotifications);
    } catch {
      // silently ignore network errors
    }
  }, [playNotificationSound]);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(() => { if (!document.hidden) fetchNotifications(); }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // ---------- Close on outside click ----------
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ---------- Mark as read ----------
  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      // ignore
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div ref={containerRef} className="relative">
      {/* Bell trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-white/10 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-gray-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close notifications"
              className="fixed inset-0 z-40 cursor-default bg-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="fixed left-3 right-3 top-[4.5rem] bg-[#1a2255] rounded-2xl shadow-xl border border-white/10 z-50 overflow-hidden max-h-[min(70vh,calc(100dvh-6rem))] md:absolute md:left-auto md:right-0 md:top-auto md:mt-2 md:w-[360px] md:max-h-none md:rounded-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h3 className="text-sm font-semibold text-white">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-[min(70vh,calc(100dvh-9.5rem))] overflow-y-auto divide-y divide-white/5 md:max-h-[400px]">
                {notifications.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-gray-500">
                    No notifications
                  </div>
                ) : (
                  notifications
                    .slice(0, MAX_DISPLAY)
                    .map((n) => (
                      <NotificationItem
                        key={n.id}
                        notification={n}
                        onRead={markAsRead}
                        onNavigate={() => setOpen(false)}
                        dark
                      />
                    ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
