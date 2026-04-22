"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TeamChatPanel } from "@/components/chat/team-chat-panel";

function TeamChatInner() {
  const params = useSearchParams();
  const thread = params?.get("thread");
  return (
    <div className="p-6 md:p-8 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold text-[#0D1B39] tracking-tight">Chat</h1>
        <p className="text-gray-400 text-[13px] mt-1">
          Direct messages, department channels, and admin broadcasts.
        </p>
      </div>
      <TeamChatPanel initialThreadId={thread} />
    </div>
  );
}

export default function TeamChatPage() {
  return (
    <Suspense fallback={null}>
      <TeamChatInner />
    </Suspense>
  );
}
