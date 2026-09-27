"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import NotificationItem, { type Notification } from "./notification-item";
import { useNotificationPulse } from "@/hooks/use-notification-pulse";
import {
  announcePlatformNotification,
  enablePlatformNotifications,
} from "@/lib/platform-notification-client";

const MAX_DISPLAY = 10;

export default function AdminNotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousUnreadIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef<boolean>(true);
  const requestActive = useRef(false);
  const notificationsSnapshot = useRef("");

  // ---------- Fetch ----------
  const fetchNotifications = useCallback(async () => {
    if (requestActive.current) return;
    requestActive.current = true;
    try {
      const res = await fetch(
        `/api/notifications?unreadOnly=true&limit=${MAX_DISPLAY}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const newNotifications = data.notifications || [];
      
      const unreadNotifications = newNotifications.filter((n: Notification) => !n.is_read);
      // Client-message audio is handled globally by AdminSidebar so it also
      // works away from the dashboard. Excluding it here prevents a double tone.
      const hasNewAudibleNotification = unreadNotifications.some(
        (notification: Notification) => notification.type !== "new_message" && !previousUnreadIds.current.has(notification.id),
      );

      if (!isFirstLoad.current && hasNewAudibleNotification) {
        const newest = unreadNotifications.find(
          (notification: Notification) =>
            notification.type !== "new_message" &&
            !previousUnreadIds.current.has(notification.id),
        );
        announcePlatformNotification({
          title: newest?.title || "CDS Space",
          body: newest?.message || "You have a new admin update.",
          volume: 0.8,
        });
      }

      previousUnreadIds.current = new Set(unreadNotifications.map((notification: Notification) => notification.id));
      isFirstLoad.current = false;
      const snapshot = JSON.stringify(newNotifications);
      if (snapshot !== notificationsSnapshot.current) {
        notificationsSnapshot.current = snapshot;
        setNotifications(newNotifications);
      }
    } catch {
      // silently ignore network errors
    } finally {
      requestActive.current = false;
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);
  useNotificationPulse("admin", fetchNotifications);
  useEffect(() => {
    window.addEventListener("cds:notification-pulse", fetchNotifications);
    return () => window.removeEventListener("cds:notification-pulse", fetchNotifications);
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
        onClick={() => {
          void enablePlatformNotifications();
          setOpen((v) => !v);
        }}
        className="relative rounded-lg p-2 transition-colors hover:bg-gray-100"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-gray-700" />
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
              className="fixed left-3 right-3 top-[4.5rem] z-50 max-h-[min(70vh,calc(100dvh-6rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl md:absolute md:left-auto md:right-0 md:top-auto md:mt-2 md:w-[360px] md:max-h-none md:rounded-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-[min(70vh,calc(100dvh-9.5rem))] divide-y divide-gray-100 overflow-y-auto md:max-h-[400px]">
                {notifications.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-gray-400">
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
