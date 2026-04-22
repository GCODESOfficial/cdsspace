"use client";

import { AdminChatPanel } from "@/components/chat/admin-chat-panel";
import { MessageSquare } from "lucide-react";

export default function AdminMessagesPage() {
  return (
    <div className="p-8 h-screen flex flex-col max-w-[1200px]">
      {/* Header */}
      <div className="mb-6 flex-shrink-0">
        <p className="text-[#0A4FE8] text-sm font-semibold">Communication</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Client Conversation</h1>
      </div>

      {/* Chat Panel */}
      <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-0">
        <AdminChatPanel />
      </div>
    </div>
  );
}
