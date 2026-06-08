"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TeamChatPanel } from "@/components/chat/team-chat-panel";

function AdminChatInner() {
  const params = useSearchParams();
  const thread = params?.get("thread");
  return (
    <div className="h-[calc(100dvh-80px)] min-h-0 w-full overflow-hidden p-2 sm:h-[calc(100dvh-96px)] sm:p-4 lg:h-[calc(100dvh-48px)] lg:p-6">
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
