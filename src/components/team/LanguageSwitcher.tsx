"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useTranslation, LOCALES, type Locale } from "@/lib/i18n/context";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const current = LOCALES.find((l) => l.code === locale) || LOCALES[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-brand-stroke/40 text-[13px] font-medium text-brand-navy hover:border-brand-blue/40 hover:text-brand-blue transition"
      >
        <Globe className="w-4 h-4" />
        {compact ? (
          <span className="uppercase text-[11px]">{current.code}</span>
        ) : (
          <span>{current.nativeLabel}</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 max-h-80 overflow-y-auto rounded-xl bg-white border border-brand-stroke/40 shadow-lg z-50 py-1">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLocale(l.code as Locale);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-[13px] hover:bg-brand-bg/60 transition ${
                l.code === locale ? "text-brand-blue font-semibold" : "text-brand-navy"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="uppercase text-[10px] font-mono text-brand-body/50">
                  {l.code}
                </span>
                {l.nativeLabel}
              </span>
              {l.code === locale && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
