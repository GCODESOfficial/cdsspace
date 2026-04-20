"use client";

import { useRouter } from "next/navigation";
import {
  PackageCheck,
  MessageSquare,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { relativeTime } from "@/lib/relative-time";

export interface Notification {
  id: string;
  user_id: string;
  type: "order_update" | "new_message" | "status_change" | "new_order";
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationItemProps {
  notification: Notification;
  onRead: (id: string) => void;
  dark?: boolean;
}

const typeIcons: Record<Notification["type"], React.ElementType> = {
  order_update: PackageCheck,
  new_message: MessageSquare,
  status_change: RefreshCw,
  new_order: ShoppingBag,
};

export default function NotificationItem({
  notification,
  onRead,
  dark = false,
}: NotificationItemProps) {
  const router = useRouter();
  const Icon = typeIcons[notification.type] ?? PackageCheck;

  const handleClick = () => {
    onRead(notification.id);
    if (notification.link) {
      router.push(notification.link);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        w-full flex items-start gap-3 px-4 py-3 text-left transition-colors
        ${
          dark
            ? `hover:bg-white/5 ${
                !notification.is_read
                  ? "border-l-2 border-blue-500 bg-white/[0.03]"
                  : "border-l-2 border-transparent"
              }`
            : `hover:bg-gray-50 ${
                !notification.is_read
                  ? "border-l-2 border-blue-500 bg-blue-50/40"
                  : "border-l-2 border-transparent"
              }`
        }
      `}
    >
      {/* Icon */}
      <div
        className={`mt-0.5 flex-shrink-0 rounded-lg p-2 ${
          dark ? "bg-white/10 text-blue-400" : "bg-gray-100 text-gray-600"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-semibold truncate ${
              dark ? "text-white" : "text-gray-900"
            }`}
          >
            {notification.title}
          </span>
          {!notification.is_read && (
            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-blue-500" />
          )}
        </div>
        <p
          className={`text-xs mt-0.5 line-clamp-2 ${
            dark ? "text-gray-400" : "text-gray-500"
          }`}
        >
          {notification.message}
        </p>
        <span
          className={`text-[11px] mt-1 block ${
            dark ? "text-gray-500" : "text-gray-400"
          }`}
        >
          {relativeTime(notification.created_at)}
        </span>
      </div>
    </button>
  );
}
