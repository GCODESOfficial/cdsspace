"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { searchTutorialTargets, tutorialTarget, TUTORIAL_TARGETS, type TutorialTarget } from "@/lib/tutorial-targets";

/**
 * Files one tutorial under everything it covers.
 *
 * A video often explains a job that spans several screens, so this takes tags
 * rather than a single tool: type, pick from what matches, and the chosen
 * tools, modules and pages become the tutorial's tags. The list is the real
 * catalogue of platform screens, so an admin picks names they recognise
 * rather than guessing a slug.
 */
const KIND_STYLE: Record<TutorialTarget["kind"], string> = {
  tool: "bg-blue-50 text-[#0A4FE8]",
  module: "bg-violet-50 text-violet-700",
  page: "bg-slate-100 text-slate-600",
};

export function TutorialTargetPicker({
  value,
  onChange,
  max = 12,
  label = "Tools, modules and pages this video covers",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const found = query.trim()
      ? searchTutorialTargets(query, 14)
      : TUTORIAL_TARGETS.filter((target) => target.kind !== "page").slice(0, 14);
    return found.filter((target) => !value.includes(target.slug));
  }, [query, value]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  const add = (slug: string) => {
    if (value.includes(slug) || value.length >= max) return;
    onChange([...value, slug]);
    setQuery("");
    setOpen(true);
  };

  const remove = (slug: string) => onChange(value.filter((entry) => entry !== slug));

  return (
    <div ref={boxRef} className="relative flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-[#344054]" htmlFor="tutorial-target-search">{label}</label>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((slug) => {
            const target = tutorialTarget(slug);
            return (
              <li key={slug} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 py-1 pe-1 ps-2.5 text-[12px] font-semibold text-[#0A4FE8]">
                <span>{target?.label || slug}</span>
                {target && <span className="text-[10px] font-medium text-[#0A4FE8]/70">{target.portal}</span>}
                <button
                  type="button"
                  onClick={() => remove(slug)}
                  aria-label={`Remove ${target?.label || slug}`}
                  className="grid h-5 w-5 place-items-center rounded-full text-[#0A4FE8]/70 hover:bg-white hover:text-[#0A4FE8]"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-[#D0D5DD] bg-white px-3 py-2.5 focus-within:border-[#0A4FE8]">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          id="tutorial-target-search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(matches.length - 1, index + 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
            else if (event.key === "Enter" && open && matches[activeIndex]) { event.preventDefault(); add(matches[activeIndex].slug); }
            else if (event.key === "Escape") { setOpen(false); }
            else if (event.key === "Backspace" && !query && value.length) { remove(value[value.length - 1]); }
          }}
          placeholder={value.length ? "Add another screen…" : "Start typing a tool, module or page…"}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="tutorial-target-options"
          className="w-full bg-transparent text-[13px] text-[#07133B] outline-none placeholder:text-slate-400"
        />
      </div>

      <p className="text-[11px] text-[#667085]">
        {value.length >= max
          ? `That is the maximum of ${max}. Remove one to add another.`
          : "One video can cover several screens. Pick every place it should appear."}
      </p>

      {open && matches.length > 0 && (
        <ul
          id="tutorial-target-options"
          role="listbox"
          className="layer-popover absolute inset-x-0 top-full mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
        >
          {matches.map((target, index) => (
            <li key={target.slug}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => add(target.slug)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] ${index === activeIndex ? "bg-blue-50 text-[#0A4FE8]" : "text-[#07133B] hover:bg-slate-50"}`}
              >
                <span className="min-w-0 truncate font-medium">{target.label}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">{target.portal}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${KIND_STYLE[target.kind]}`}>{target.kind}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim() && matches.length === 0 && (
        <p className="layer-popover absolute inset-x-0 top-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] text-[#667085] shadow-lg">
          Nothing matches that. Try the screen name as it appears in the sidebar.
        </p>
      )}
    </div>
  );
}
