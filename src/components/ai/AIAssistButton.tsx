"use client";

import { useState } from "react";
import { PenLine, Loader2, RefreshCw, Check } from "lucide-react";
import type { AIKind } from "@/lib/ai/prompts";

/**
 * Inline "✨ AI draft" button for any form field.
 *
 * Instead of opening a review modal, it writes the generated text DIRECTLY
 * into the target field via `onAccept`. The user can immediately edit what
 * it wrote. A small "Regenerate" affordance appears next to the button after
 * the first draft lands.
 *
 * Drop it beside (or absolutely-position it inside) a textarea/input and pass
 * `onAccept={(txt) => setValue(txt)}`.
 */
export function AIAssistButton<I extends Record<string, unknown>>({
  kind,
  input,
  label = "AI fill",
  onAccept,
  className = "",
}: {
  kind: AIKind;
  input: I;
  label?: string;
  onAccept: (text: string) => void;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, input }),
      });
      const raw = await r.text();
      let j: { ok?: boolean; error?: string; text?: string } | null = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(raw?.slice(0, 160) || `AI request failed (${r.status})`);
      }
      if (!r.ok || !j?.ok) throw new Error(j?.error || `AI request failed (${r.status})`);
      const text = (j.text || "").trim();
      if (text) {
        onAccept(text);
        setFilled(true);
        setTimeout(() => setFilled(false), 1800);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setTimeout(() => setError(null), 3500);
    } finally {
      setLoading(false);
    }
  }

  const Icon = loading ? Loader2 : filled ? Check : filled === false && !loading && !error ? PenLine : PenLine;

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        title={error ?? (filled ? "Filled - click to regenerate" : "Let AI fill this for you")}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold shadow-sm hover:shadow-md transition disabled:opacity-70 ${
          error
            ? "bg-rose-500 text-white"
            : filled
            ? "bg-emerald-500 text-white"
            : "bg-gradient-to-r from-[#0A4FE8] to-[#7B3AED] text-white"
        }`}
      >
        <Icon className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Drafting…" : filled ? "Filled" : error ? "Retry" : label}
      </button>
      {filled && !loading && (
        <button
          type="button"
          onClick={run}
          title="Regenerate"
          className="ml-1 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
      {error && (
        <span className="absolute right-0 top-full z-20 mt-1 max-w-[min(20rem,80vw)] rounded-lg border border-rose-100 bg-white px-3 py-2 text-[11px] font-medium leading-4 text-rose-600 shadow-lg">
          {error}
        </span>
      )}
    </div>
  );
}
