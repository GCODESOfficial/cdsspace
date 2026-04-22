"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TeamChatPanel } from "@/components/chat/team-chat-panel";

function AdminChatInner() {
  const params = useSearchParams();
  const thread = params?.get("thread");
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-6">
        <p className="text-[#0A4FE8] text-sm font-semibold">Workspace</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Team Chat</h1>
        <p className="text-gray-400 text-[13px] mt-1">
          Internal chat with all team members, department channels, and company-wide broadcasts.
        </p>
      </div>
      <TeamChatPanel initialThreadId={thread} />
    </div>
  );
}

export default function AdminChatPage() {
  return (
    <Suspense fallback={null}>
      <AdminChatInner />
    </Suspense>
  );
}
