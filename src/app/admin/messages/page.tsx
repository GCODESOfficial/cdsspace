"use client";

import { AdminChatPanel } from "@/components/chat/admin-chat-panel";

export default function AdminMessagesPage() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-64px)] w-full max-w-[1480px] items-center justify-center p-4 md:p-6 lg:h-screen lg:p-8">
      <div className="h-full min-h-0 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <AdminChatPanel />
      </div>
    </div>
  );
}
