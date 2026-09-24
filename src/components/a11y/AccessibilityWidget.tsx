"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Accessibility, X, RotateCcw, Contrast, Link2, Eye, Square, Type,
  AlignJustify, Focus, MousePointer2, Waves, Palette, Globe,
} from "lucide-react";
import { LOCALES } from "@/lib/i18n/context";

type TextSize = "medium" | "big" | "large";
type ColourVision = "standard" | "protanopia" | "deuteranopia" | "tritanopia" | "grayscale";

interface A11ySettings {
  textSize: TextSize;
  colourVision: ColourVision;
  invert: boolean;
  reduceMotion: boolean;
  underlineLinks: boolean;
  highContrast: boolean;
  solidSurfaces: boolean;
  spaciousText: boolean;
  strongFocus: boolean;
  largeCursor: boolean;
}

const STORAGE_KEY = "cds.a11y.v1";
const WELCOME_KEY = "cds.a11y.welcomed.v1";

const DEFAULTS: A11ySettings = {
  textSize: "medium", colourVision: "standard",
  invert: false, reduceMotion: false, underlineLinks: false, highContrast: false,
  solidSurfaces: false, spaciousText: false, strongFocus: false, largeCursor: false,
};

const TOGGLES: { key: keyof A11ySettings; icon: React.ElementType; title: string; desc: string }[] = [
  { key: "invert", icon: Contrast, title: "Invert colours", desc: "Reverse interface luminance." },
  { key: "reduceMotion", icon: Waves, title: "Reduce motion", desc: "Stop nonessential movement." },
  { key: "underlineLinks", icon: Link2, title: "Underline links", desc: "Clarify every navigation action." },
  { key: "highContrast", icon: Eye, title: "High contrast", desc: "Strengthen text and boundaries." },
  { key: "solidSurfaces", icon: Square, title: "Solid surfaces", desc: "Remove glass transparency." },
  { key: "spaciousText", icon: AlignJustify, title: "Spacious text", desc: "Increase line and word spacing." },
  { key: "strongFocus", icon: Focus, title: "Strong focus", desc: "Highlight keyboard position." },
  { key: "largeCursor", icon: MousePointer2, title: "Large cursor", desc: "Use a larger pointer." },
];

const LAUNCHER_SIZE = 48;
const LAUNCHER_MARGIN = 16;
const LAUNCHER_POS_KEY = "cds.a11y.pos";

// Position is stored as a viewport fraction so it survives resizes and rotation.
function clampLauncher(x: number, y: number) {
  const maxX = Math.max(LAUNCHER_MARGIN, window.innerWidth - LAUNCHER_SIZE - LAUNCHER_MARGIN);
  const maxY = Math.max(LAUNCHER_MARGIN, window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN);
  return {
    x: Math.min(Math.max(x, LAUNCHER_MARGIN), maxX),
    y: Math.min(Math.max(y, LAUNCHER_MARGIN), maxY),
  };
}

function apply(s: A11ySettings) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.dataset.a11yText = s.textSize;
  html.classList.toggle("a11y-invert", s.invert);
  html.classList.toggle("a11y-reduce-motion", s.reduceMotion);
  html.classList.toggle("a11y-underline", s.underlineLinks);
  html.classList.toggle("a11y-solid", s.solidSurfaces);
  html.classList.toggle("a11y-spacious", s.spaciousText);
  html.classList.toggle("a11y-focus", s.strongFocus);
  html.classList.toggle("a11y-cursor", s.largeCursor);

  const f: string[] = [];
  if (s.invert) f.push("invert(1) hue-rotate(180deg)");
  if (s.highContrast) f.push("contrast(1.3)");
  if (s.colourVision === "grayscale") f.push("grayscale(1)");
  else if (s.colourVision !== "standard") f.push(`url(#a11y-${s.colourVision})`);
  html.style.setProperty("--a11y-filter", f.length ? f.join(" ") : "none");
}

export function AccessibilityWidget() {
  const pathname = usePathname();
  const isChatPage =
    pathname === "/team/chat" ||
    pathname === "/admin/chat" ||
    pathname === "/admin/messages" ||
    pathname === "/dashboard/messages" ||
    pathname.endsWith("/dashboard/messages");
  if (pathname.startsWith("/meet/") || isChatPage) return null;
  return <AccessibilityWidgetContent />;
}

function AccessibilityWidgetContent() {
  const [open, setOpen] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);
  const [languagePrompt, setLanguagePrompt] = useState<{ locale: string; countryName: string } | null>(null);
  const [s, setS] = useState<A11ySettings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [lang, setLang] = useState("en");
  const panelRef = useRef<HTMLDivElement>(null);

  // Draggable launcher: free placement anywhere on screen, remembered across visits.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
      setLang(localStorage.getItem("cds.lang") || "en");
      const rawPos = localStorage.getItem(LAUNCHER_POS_KEY);
      if (rawPos) {
        const { fx, fy } = JSON.parse(rawPos) as { fx: number; fy: number };
        if (Number.isFinite(fx) && Number.isFinite(fy)) {
          setPos(clampLauncher(fx * window.innerWidth, fy * window.innerHeight));
        }
      }
      if (!localStorage.getItem(WELCOME_KEY)) {
        setFirstVisit(true);
        setOpen(true);
      }
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  // Default to the bottom-left, and keep the launcher on screen when the viewport changes.
  useEffect(() => {
    const place = () => {
      setPos((prev) => {
        if (!prev) return null;
        return clampLauncher(prev.x, prev.y);
      });
    };
    setPos((prev) => prev ?? clampLauncher(LAUNCHER_MARGIN, window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN));
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);

  const savePos = (p: { x: number; y: number }) => {
    try {
      localStorage.setItem(LAUNCHER_POS_KEY, JSON.stringify({ fx: p.x / window.innerWidth, fy: p.y / window.innerHeight }));
    } catch { /* ignore */ }
  };

  const onLauncherDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onLauncherMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 5) {
      d.moved = true;
      setDragging(true);
    }
    if (d.moved) setPos(clampLauncher(e.clientX - d.offsetX, e.clientY - d.offsetY));
  };
  const onLauncherUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d) return;
    if (!d.moved) { setOpen(true); return; }
    const next = clampLauncher(e.clientX - d.offsetX, e.clientY - d.offsetY);
    setPos(next);
    savePos(next);
  };
  // Keyboard nudging so the launcher is movable without a pointer.
  const onLauncherKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 40 : 10;
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0],
    };
    const delta = deltas[e.key];
    if (!delta || !pos) return;
    e.preventDefault();
    const next = clampLauncher(pos.x + delta[0], pos.y + delta[1]);
    setPos(next);
    savePos(next);
  };

  const changeLanguage = (code: string) => {
    setLang(code);
    setLanguagePrompt(null);
    try { localStorage.setItem("cds.lang", code); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("cds-set-lang", { detail: code }));
  };

  // Reflect a language the engine auto-detected from the visitor's country.
  useEffect(() => {
    const onDetected = (e: Event) => setLang((e as CustomEvent).detail as string);
    const onLocation = (event: Event) => {
      const detail = (event as CustomEvent<{ locale?: string; name?: string; country?: string }>).detail;
      if (detail?.locale && detail.locale !== "en") {
        setLanguagePrompt({ locale: detail.locale, countryName: detail.name || detail.country || "your region" });
      }
    };
    window.addEventListener("cds-lang-detected", onDetected);
    window.addEventListener("cds-language-location", onLocation);
    return () => {
      window.removeEventListener("cds-lang-detected", onDetected);
      window.removeEventListener("cds-language-location", onLocation);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    apply(s);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }, [s, ready]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !firstVisit) setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [firstVisit, open]);

  const completeAccessibilitySetup = () => {
    try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* ignore */ }
    setFirstVisit(false);
    setOpen(false);
  };

  const toggle = (key: keyof A11ySettings) => setS((p) => ({ ...p, [key]: !p[key] }));
  const changeTextSize = (textSize: TextSize) => {
    setS((previous) => ({ ...previous, textSize }));
    requestAnimationFrame(() => {
      if (panelRef.current) panelRef.current.scrollTop = 0;
    });
  };

  const resetSettings = () => {
    setS(DEFAULTS);
    requestAnimationFrame(() => {
      if (panelRef.current) panelRef.current.scrollTop = 0;
    });
  };

  return (
    <div id="cds-a11y-widget">
      <ColourVisionFilters />

      {languagePrompt && !open && (
        <div role="status" className="fixed left-1/2 top-4 z-[145] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-blue-100 bg-white p-4 text-[#0D1B39] shadow-2xl">
          <p className="text-sm font-semibold">Language selected for {languagePrompt.countryName}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">We selected {LOCALES.find((item) => item.code === languagePrompt.locale)?.nativeLabel || languagePrompt.locale}. You can keep it or return to English.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setLanguagePrompt(null)} className="rounded-xl bg-[#0A4FE8] px-4 py-2 text-xs font-semibold text-white">Keep this language</button>
            <button type="button" onClick={() => changeLanguage("en")} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700">Return to English</button>
          </div>
        </div>
      )}

      {/* Launcher - draggable to any point on the screen */}
      <button
        type="button"
        onPointerDown={onLauncherDown}
        onPointerMove={onLauncherMove}
        onPointerUp={onLauncherUp}
        onKeyDown={onLauncherKeyDown}
        aria-label="Accessibility options (drag, or use arrow keys, to move)"
        className={`fixed z-[130] flex h-12 w-12 touch-none items-center justify-center rounded-full text-white shadow-xl shadow-blue-900/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/40 ${
          dragging ? "cursor-grabbing transition-none" : "cursor-grab transition"
        }`}
        style={{
          left: pos?.x ?? LAUNCHER_MARGIN,
          top: pos?.y,
          bottom: pos ? undefined : LAUNCHER_MARGIN,
          visibility: pos ? undefined : "hidden",
          backgroundImage: "linear-gradient(146deg, #0035C1 8%, #0575FF 86%)",
        }}
      >
        <Accessibility className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[140] flex items-end justify-center overflow-y-auto overscroll-contain bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => { if (!firstVisit) setOpen(false); }}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cds-a11y-title"
            data-a11y-panel
            onClick={(e) => e.stopPropagation()}
            className="max-h-[calc(100dvh-max(0.5rem,env(safe-area-inset-top)))] w-full overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-200 bg-white text-[#0D1B39] shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:w-[min(48rem,calc(100vw-2rem))] sm:rounded-3xl"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ backgroundImage: "linear-gradient(146deg, #0035C1 8%, #0575FF 86%)" }}>
                  <Accessibility className="h-5 w-5" />
                </span>
                <h2 id="cds-a11y-title" className="text-lg font-bold">Accessibility</h2>
              </div>
              {!firstVisit && <button type="button" onClick={() => setOpen(false)} aria-label="Close accessibility settings" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
                <X className="h-5 w-5" />
              </button>}
            </div>

            <div className="space-y-5 p-5">
              {firstVisit && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-[#0D1B39]">Set up your viewing preferences</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Choose your language and any accessibility support before continuing. You can change these settings at any time.</p>
                </div>
              )}
              {languagePrompt && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-950">We detected {languagePrompt.countryName}</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">The site is using {LOCALES.find((item) => item.code === languagePrompt.locale)?.nativeLabel || languagePrompt.locale}. Prefer English?</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setLanguagePrompt(null)} className="rounded-xl bg-amber-900 px-3 py-2 text-xs font-semibold text-white">Keep this language</button>
                    <button type="button" onClick={() => changeLanguage("en")} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950">Return to English</button>
                  </div>
                </div>
              )}
              {/* Language - translates the whole app into the selected language */}
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3.5">
                <div className="mb-2 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-[#0A4FE8]" />
                  <span className="text-sm font-semibold text-[#0D1B39]">Language</span>
                </div>
                {/* Options stay as native language names - never translate these. */}
                <select value={lang} onChange={(e) => changeLanguage(e.target.value)} data-no-translate
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-medium text-[#0D1B39] outline-none focus:border-blue-400">
                  {LOCALES.map((l) => (
                    <option key={l.code} value={l.code}>{l.nativeLabel} ({l.label})</option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] text-slate-500">Translates the entire site, dashboard, chats and documents.</p>
              </div>

              {/* Text size */}
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><Type className="h-4 w-4 text-[#0A4FE8]" /> Text size</span>
                <div className="grid w-full grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 md:w-auto">
                  {(["medium", "big", "large"] as TextSize[]).map((size) => (
                    <button key={size} type="button" onClick={() => changeTextSize(size)}
                      className={`rounded-xl px-3 py-2 text-[13px] font-semibold capitalize transition ${s.textSize === size ? "bg-[#0A4FE8] text-white shadow" : "text-slate-500 hover:text-slate-800"}`}>
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Colour vision */}
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><Palette className="h-4 w-4 text-[#0A4FE8]" /> Colour vision</span>
                <select value={s.colourVision} onChange={(e) => setS((p) => ({ ...p, colourVision: e.target.value as ColourVision }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-medium text-[#0D1B39] outline-none focus:border-blue-400 md:w-auto md:min-w-[260px]">
                  <option value="standard">Standard colour</option>
                  <option value="protanopia">Protanopia (red-weak)</option>
                  <option value="deuteranopia">Deuteranopia (green-weak)</option>
                  <option value="tritanopia">Tritanopia (blue-weak)</option>
                  <option value="grayscale">Grayscale</option>
                </select>
              </div>

              {/* Toggle cards */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {TOGGLES.map((t) => {
                  const on = s[t.key] as boolean;
                  return (
                    <button key={t.key} type="button" onClick={() => toggle(t.key)}
                      className={`flex w-full min-w-0 items-start gap-3 rounded-2xl border p-3.5 text-left transition ${on ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}>
                      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${on ? "bg-blue-100 text-[#0A4FE8]" : "bg-slate-100 text-slate-500"}`}>
                        <t.icon className="h-4.5 w-4.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-[13px] font-bold leading-snug text-[#0D1B39]">{t.title}</span>
                        <span className="mt-0.5 block break-words text-[11px] leading-relaxed text-slate-500">{t.desc}</span>
                      </span>
                      <span className={`mt-1 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${on ? "bg-[#0A4FE8]" : "bg-slate-300"}`}>
                        <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0"}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 flex flex-col items-stretch justify-between gap-3 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center">
              <p className="text-[11px] text-slate-400">Preferences are saved on this device and apply across CDS Space.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={resetSettings}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12px] font-semibold text-slate-600 hover:bg-slate-100">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset settings
                </button>
                {firstVisit && <button type="button" onClick={completeAccessibilitySetup} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#0A4FE8] px-5 text-[12px] font-semibold text-white shadow-lg shadow-blue-900/15">Save and continue</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Hidden SVG colour-blindness simulation filters, referenced by CSS filter. */
function ColourVisionFilters() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0">
      <defs>
        <filter id="a11y-protanopia">
          <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0" />
        </filter>
        <filter id="a11y-deuteranopia">
          <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0" />
        </filter>
        <filter id="a11y-tritanopia">
          <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0" />
        </filter>
      </defs>
    </svg>
  );
}
