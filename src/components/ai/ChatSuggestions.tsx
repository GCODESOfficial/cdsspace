"use client";

import { useState } from "react";
import { MessageCircleReply, Loader2, RefreshCw } from "lucide-react";

/**
 * Drop this above a chat composer. Hands the last message + recent
 * history to /api/ai/generate (chat_reply_suggestions) and shows
 * 3 short replies the user can tap to insert into the composer.
 */
export function ChatSuggestions({
  lastMessage,
  history,
  channel,
  from,
  onPick,
}: {
  lastMessage: string;
  history?: string;
  channel?: string;
  from: string;
  onPick: (text: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<{ label: string; body: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "chat_reply_suggestions",
          input: { last_message: lastMessage, history, channel, from },
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "AI request failed");
      setSuggestions(j.data?.suggestions || []);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!suggestions && !loading && !error) {
    return (
      <button
        onClick={run}
        disabled={!lastMessage.trim()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0A4FE8] text-white text-[11px] font-semibold hover:shadow-md transition disabled:opacity-40"
      >
        <MessageCircleReply className="w-3 h-3" />
        Suggest replies
      </button>
    );
  }

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 text-[11px] text-gray-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Drafting replies…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-[11px] text-rose-600 inline-flex items-center gap-2">
        {error}
        <button onClick={run} className="underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 flex-wrap">
      {(suggestions || []).map((s, i) => (
        <button
          key={i}
          onClick={() => onPick(s.body)}
          className="text-left px-3 py-1.5 rounded-xl bg-white border border-gray-200 hover:border-[#0A4FE8]/40 hover:bg-blue-50/40 transition max-w-[260px]"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#0A4FE8]">
            {s.label}
          </span>
          <p className="text-[12px] text-[#0D1B39] mt-0.5 line-clamp-2">{s.body}</p>
        </button>
      ))}
      <button
        onClick={run}
        className="p-1.5 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition"
        title="Regenerate"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
