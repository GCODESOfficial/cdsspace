"use client";

import { useEffect, useState } from "react";
import { PlayCircle, X } from "lucide-react";
import { TutorialVideoPlayer, type TutorialPlayerItem } from "@/components/tutorials/TutorialVideoPlayer";

type PromptTutorial = TutorialPlayerItem & { openedAt: string | null };

export function ContextualTutorialPrompt({ tool, label }: { tool: string; label: string }) {
  const [tutorial, setTutorial] = useState<PromptTutorial | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    fetch(`/api/client/tutorials?tool=${encodeURIComponent(tool)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        const first = payload?.tutorials?.[0] as PromptTutorial | undefined;
        if (first && !first.openedAt) setTutorial(first);
      }).catch(() => undefined);
  }, [tool]);
  if (!tutorial || dismissed) return null;
  const report = (position: number, completed: boolean) => void fetch("/api/client/tutorials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tutorialId: tutorial.id, positionSeconds: position, completed }) });
  return playing ? <TutorialVideoPlayer tutorial={tutorial} onProgress={report} onClose={() => { setPlaying(false); setDismissed(true); }} /> : (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0A4FE8] text-white"><PlayCircle className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1"><p className="text-[12px] font-semibold text-[#07133B]">Watch video tutorial</p><p className="mt-0.5 text-[10.5px] text-[#667085]">See how to use {label} in your selected accessibility language.</p></div>
      <button type="button" onClick={() => { setPlaying(true); report(tutorial.lastPositionSeconds || 0, false); }} className="rounded-lg bg-[#0A4FE8] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[#083EC0]">Watch now</button>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss tutorial suggestion" className="rounded-lg p-2 text-gray-400 hover:bg-white hover:text-gray-600"><X className="h-4 w-4" /></button>
    </div>
  );
}
