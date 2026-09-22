"use client";

import { useMemo } from "react";
import { parseRichText } from "@/lib/rich-text";

/**
 * Shows a brief the way it was written: paragraphs as paragraphs, bullets as
 * bullets. Previously these panels printed the stored value straight into a
 * <p>, so a brief arrived on screen with its "<p>" and "<li>" tags visible.
 *
 * Deliberately builds real elements from the parsed structure rather than
 * setting innerHTML. The stored value is already sanitised on write, but a
 * rendering path that cannot inject markup at all needs no such assumption -
 * and it means these panels stay safe if a brief ever arrives from somewhere
 * that was not sanitised.
 */
export function RichText({
  value,
  tone = "light",
  className = "",
}: {
  value: string | null | undefined;
  /** Panels here sit on both white and deep blue. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const nodes = useMemo(() => parseRichText(value), [value]);
  if (!nodes.length) return null;

  const body = tone === "dark" ? "text-white/90" : "text-slate-700";
  const marker = tone === "dark" ? "marker:text-white/50" : "marker:text-slate-400";

  return (
    <div className={`space-y-2.5 text-[13px] leading-6 ${body} ${className}`}>
      {nodes.map((node, index) => (
        node.kind === "paragraph"
          ? <p key={index} className="whitespace-pre-wrap">{node.text}</p>
          : node.ordered
            ? <ol key={index} className={`list-decimal space-y-1 ps-5 ${marker}`}>{node.items.map((item, position) => <li key={position}>{item}</li>)}</ol>
            : <ul key={index} className={`list-disc space-y-1 ps-5 ${marker}`}>{node.items.map((item, position) => <li key={position}>{item}</li>)}</ul>
      ))}
    </div>
  );
}
