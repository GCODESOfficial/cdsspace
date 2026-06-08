"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TeamChatPanel } from "@/components/chat/team-chat-panel";

function TeamChatInner() {
  const params = useSearchParams();
  const thread = params?.get("thread");
  return (
    <div className="h-[calc(100dvh-176px)] min-h-0 w-full overflow-hidden sm:h-[calc(100dvh-160px)] md:h-[calc(100dvh-148px)] lg:h-[calc(100dvh-136px)]">
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
