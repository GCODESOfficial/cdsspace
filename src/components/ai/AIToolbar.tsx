"use client";

import { useState } from "react";
import {
  PenLine,
  ArrowDownToLine,
  Wand2,
  Scissors,
  FileText,
  ListTree,
  ChevronDown,
  Loader2,
} from "lucide-react";
import type { AIKind } from "@/lib/ai/prompts";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface ToolAction {
  kind: AIKind;
  label: string;
  icon: any;
  description: string;
  requiresBody?: boolean;
  extra?: Record<string, any>;
}

const ACTIONS: ToolAction[] = [
  { kind: "cdocs_continue", label: "Continue writing", icon: ArrowDownToLine, description: "Extend the doc in the same voice", requiresBody: true },
  { kind: "cdocs_improve", label: "Improve", icon: Wand2, description: "Rewrite for clarity and confidence", requiresBody: true },
  { kind: "cdocs_tighten", label: "Tighten", icon: Scissors, description: "~30% fewer words, same facts", requiresBody: true },
  { kind: "cdocs_summarize", label: "Summarize", icon: FileText, description: "Turn into 4–7 bullets", requiresBody: true },
  { kind: "cdocs_expand", label: "Expand draft", icon: ListTree, description: "Flesh out a terse draft", requiresBody: true },
  { kind: "cdocs_outline", label: "Outline a topic", icon: ListTree, description: "Generate structure from a topic" },
];

/**
 * Writing-assistant toolbar for the cDocs editor (and anywhere else
 * long-form writing happens). Inserts / replaces body via onApply.
 */
export function AIToolbar({
  body,
  onApply,
  onInsert,
}: {
  body: string;
  onApply: (newBody: string) => void;
  onInsert: (appendedBody: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busyKind, setBusyKind] = useState<AIKind | null>(null);
  const [toneOpen, setToneOpen] = useState(false);
  const [outlineTopic, setOutlineTopic] = useState("");
  const [showOutlineInput, setShowOutlineInput] = useState(false);

  async function run(action: ToolAction, input: Record<string, any>) {
    setBusyKind(action.kind);
    try {
      const r = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: action.kind, input }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        appAlert(j.error || "AI request failed");
        return;
      }
      const text: string = j.text || "";
      if (action.kind === "cdocs_continue" || action.kind === "cdocs_outline") {
        onInsert(text);
      } else {
        onApply(text);
      }
      setOpen(false);
    } finally {
      setBusyKind(null);
    }
  }

  const hasBody = !!body.trim();

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#0A4FE8] to-[#7B3AED] text-white text-[12px] font-semibold shadow-sm hover:shadow-md transition"
      >
        <PenLine className="w-3.5 h-3.5" />
        AI
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-[#0A4FE8]/5 to-[#7B3AED]/5 border-b border-gray-100">
              <p className="text-[11px] uppercase tracking-wider font-bold text-[#0A4FE8]">
                AI writing assist
              </p>
            </div>

            <div className="p-1">
              {ACTIONS.map((a) => {
                if (a.kind === "cdocs_outline") {
                  return (
                    <div key={a.kind}>
                      <button
                        onClick={() => setShowOutlineInput((s) => !s)}
                        className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left transition"
                      >
                        <a.icon className="w-4 h-4 text-[#0A4FE8] mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-[#0D1B39]">{a.label}</p>
                          <p className="text-[11px] text-gray-500">{a.description}</p>
                        </div>
                      </button>
                      {showOutlineInput && (
                        <div className="px-3 pb-3 flex gap-2">
                          <input
                            value={outlineTopic}
                            onChange={(e) => setOutlineTopic(e.target.value)}
                            placeholder="Topic…"
                            className="flex-1 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[12px] focus:outline-none"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && outlineTopic.trim()) {
                                run(a, { topic: outlineTopic });
                              }
                            }}
                          />
                          <button
                            onClick={() => run(a, { topic: outlineTopic })}
                            disabled={!outlineTopic.trim() || busyKind === a.kind}
                            className="px-3 py-2 rounded-xl bg-[#0A4FE8] text-white text-[12px] font-semibold disabled:opacity-50"
                          >
                            {busyKind === a.kind ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              "Go"
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                const disabled = (a.requiresBody && !hasBody) || busyKind !== null;
                return (
                  <button
                    key={a.kind}
                    disabled={disabled}
                    onClick={() => run(a, { body })}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <a.icon className="w-4 h-4 text-[#0A4FE8] mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#0D1B39]">{a.label}</p>
                      <p className="text-[11px] text-gray-500">{a.description}</p>
                    </div>
                    {busyKind === a.kind && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0A4FE8] mt-0.5" />
                    )}
                  </button>
                );
              })}

              {/* Tone shift */}
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={() => setToneOpen((t) => !t)}
                  disabled={!hasBody}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left transition disabled:opacity-40"
                >
                  <span className="flex items-center gap-3">
                    <Wand2 className="w-4 h-4 text-[#0A4FE8]" />
                    <span className="text-[13px] font-semibold text-[#0D1B39]">Shift tone</span>
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${toneOpen ? "rotate-180" : ""}`} />
                </button>
                {toneOpen && hasBody && (
                  <div className="px-3 pb-2 grid grid-cols-2 gap-1">
                    {["Formal", "Casual", "Confident", "Warm", "Direct", "Playful"].map((t) => (
                      <button
                        key={t}
                        onClick={() => run({ kind: "cdocs_tone_shift" } as ToolAction, { body, tone: t })}
                        disabled={busyKind !== null}
                        className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-gray-50 hover:bg-[#0A4FE8]/5 hover:text-[#0A4FE8] transition disabled:opacity-40"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
