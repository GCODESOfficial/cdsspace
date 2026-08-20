"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Crosshair,
  FileText,
  Image as ImageIcon,
  Loader2,
  Palette,
  ImagePlus,
  X,
} from "lucide-react";
import {
  BLOG_CHART_TYPES,
  BLOG_VISUAL_PALETTES,
  BLOG_VISUAL_TYPES,
  type BlogChartType,
  type BlogVisualPalette,
  type BlogVisualType,
} from "@/lib/blog/visual-options";

export interface GeneratedBlogVisual {
  url: string;
  alt_text: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  location: "cover" | "inline";
  visual_type: BlogVisualType;
  model: string;
}

interface Props {
  open: boolean;
  location: "cover" | "inline";
  articleTitle: string;
  postId?: string;
  onClose: () => void;
  onGenerated: (visual: GeneratedBlogVisual) => void;
}

const inputClass = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-[#0D1B39] outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100";

export function BlogVisualGeneratorDialog({
  open,
  location,
  articleTitle,
  postId,
  onClose,
  onGenerated,
}: Props) {
  const [brief, setBrief] = useState("");
  const [focus, setFocus] = useState("");
  const [visualType, setVisualType] = useState<BlogVisualType>("image");
  const [palette, setPalette] = useState<BlogVisualPalette>("cds_core");
  const [customColors, setCustomColors] = useState(["#040B37", "#1C4ED1", "#F4F6FB", "#FFFFFF"]);
  const [visualText, setVisualText] = useState("");
  const [chartType, setChartType] = useState<BlogChartType>("bar");
  const [chartData, setChartData] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function generate() {
    if (!brief.trim()) {
      setError("Add a creative brief for this visual.");
      return;
    }
    if (!focus.trim()) {
      setError("Add the main subject or message to focus on.");
      return;
    }
    if ((visualType === "image_text" || visualType === "infographic") && !visualText.trim()) {
      setError("Add the short text that should appear in the visual.");
      return;
    }
    if (visualType === "chart" && chartData.split(/\r?\n/).filter(Boolean).length < 2) {
      setError("Add at least two chart values using Label: value.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/blog/visual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          location,
          article_title: articleTitle,
          post_id: postId || null,
          brief,
          focus,
          visual_type: visualType,
          palette,
          custom_colors: palette === "custom" ? customColors : undefined,
          visual_text: visualText,
          chart_type: chartType,
          chart_data: chartData,
        }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Visual generation failed." }));
      if (!res.ok || !json.ok) throw new Error(json.error || "Visual generation failed.");
      onGenerated(json.visual as GeneratedBlogVisual);
      setBrief("");
      setFocus("");
      setVisualText("");
      setChartData("");
      onClose();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Visual generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#040B37]/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="blog-visual-title"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-[24px] border border-white/70 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0A4FE8]">
              <ImagePlus className="h-3.5 w-3.5" /> Intelligence visual
            </div>
            <h2 id="blog-visual-title" className="text-[20px] font-bold text-[#0D1B39]">
              Generate {location === "cover" ? "cover image" : "inline visual"}
            </h2>
            <p className="mt-1 text-[12.5px] text-gray-500">
              Brief the visual before it is generated and added to the article.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-gray-600">
                <FileText className="h-3.5 w-3.5 text-[#0A4FE8]" /> Creative brief
              </span>
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                rows={3}
                maxLength={1200}
                placeholder="Describe the idea, scene, message, audience, and desired mood."
                className={`${inputClass} resize-y`}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-gray-600">
                <Crosshair className="h-3.5 w-3.5 text-[#0A4FE8]" /> Main focus
              </span>
              <input
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                maxLength={400}
                placeholder="What must viewers notice or understand first?"
                className={inputClass}
              />
            </label>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-gray-600">
              <ImageIcon className="h-3.5 w-3.5 text-[#0A4FE8]" /> Type of visual
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {BLOG_VISUAL_TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setVisualType(option.value)}
                  className={`rounded-xl border p-3 text-left transition ${
                    visualType === option.value
                      ? "border-[#0A4FE8] bg-blue-50 ring-1 ring-[#0A4FE8]/20"
                      : "border-gray-200 bg-white hover:border-blue-200"
                  }`}
                >
                  <span className="block text-[12.5px] font-bold text-[#0D1B39]">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-gray-500">{option.description}</span>
                </button>
              ))}
            </div>
          </section>

          {(visualType === "image_text" || visualType === "infographic") && (
            <label>
              <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">Exact text to include</span>
              <input
                value={visualText}
                onChange={(event) => setVisualText(event.target.value)}
                maxLength={100}
                placeholder="Keep it short, ideally eight words or fewer."
                className={inputClass}
              />
            </label>
          )}

          {visualType === "chart" && (
            <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#0A4FE8]" />
                <p className="text-[12.5px] font-bold text-[#0D1B39]">Chart settings</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {BLOG_CHART_TYPES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setChartType(option.value)}
                    className={`rounded-lg border px-2 py-2 text-[11.5px] font-semibold transition ${
                      chartType === option.value
                        ? "border-[#0A4FE8] bg-[#0A4FE8] text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-blue-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">Chart headline (optional)</span>
                <input
                  value={visualText}
                  onChange={(event) => setVisualText(event.target.value)}
                  maxLength={100}
                  placeholder="Defaults to the creative brief."
                  className={inputClass}
                />
              </label>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">Chart data</span>
                <textarea
                  value={chartData}
                  onChange={(event) => setChartData(event.target.value)}
                  rows={5}
                  placeholder={"Brand awareness: 68\nCustomer trust: 82\nPurchase intent: 57"}
                  className={`${inputClass} resize-y font-mono`}
                />
                <span className="mt-1.5 block text-[10.5px] text-gray-500">
                  One positive value per line using Label: value. Up to 12 values.
                </span>
              </label>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-gray-600">
              <Palette className="h-3.5 w-3.5 text-[#0A4FE8]" /> Colour scheme
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {BLOG_VISUAL_PALETTES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPalette(option.value)}
                  className={`rounded-xl border p-3 text-left transition ${
                    palette === option.value
                      ? "border-[#0A4FE8] bg-blue-50 ring-1 ring-[#0A4FE8]/20"
                      : "border-gray-200 bg-white hover:border-blue-200"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span>
                      <span className="block text-[12.5px] font-bold text-[#0D1B39]">{option.label}</span>
                      <span className="block text-[10.5px] text-gray-500">{option.description}</span>
                    </span>
                    <span className="flex -space-x-1">
                      {option.colors.map((color) => (
                        <span key={color} title={color} className="h-6 w-6 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: color }} />
                      ))}
                    </span>
                  </span>
                  <span className="mt-2 block font-mono text-[9.5px] text-gray-400">{option.colors.join(" · ")}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPalette("custom")}
                className={`rounded-xl border p-3 text-left transition ${
                  palette === "custom"
                    ? "border-[#0A4FE8] bg-blue-50 ring-1 ring-[#0A4FE8]/20"
                    : "border-gray-200 bg-white hover:border-blue-200"
                }`}
              >
                <span className="block text-[12.5px] font-bold text-[#0D1B39]">Custom palette</span>
                <span className="block text-[10.5px] text-gray-500">Choose your own four colours.</span>
              </button>
            </div>
            {palette === "custom" && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {customColors.map((color, index) => (
                  <label key={index} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(event) => setCustomColors((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value.toUpperCase() : item))}
                      className="h-8 w-8 rounded border-0 bg-transparent"
                    />
                    <span className="font-mono text-[10px] text-gray-500">{color}</span>
                  </label>
                ))}
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-600">
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-gray-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <p className="hidden text-[10.5px] text-gray-400 sm:block">
            AI images may take up to two minutes. Charts are generated instantly.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={generate} disabled={busy}
              className="inline-flex min-w-[150px] items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-md shadow-blue-200 transition hover:bg-[#083EC0] disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {busy ? "Generating…" : "Generate visual"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
