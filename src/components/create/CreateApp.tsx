"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BadgeCheck, Box, Cake, Check, ChevronDown, ChevronsLeft, ChevronsRight, Clapperboard,
  Copy, Download, Eraser, Figma, Film, Gem, ImageIcon, ImagePlus, Images, LayoutDashboard,
  LayoutGrid, Lightbulb, Loader2, Megaphone, Paintbrush, Palette, PenTool, Plus, QrCode, Repeat,
  Search, Shapes, Shirt, Spline, Star, Trash2, Upload, Video, Wand2, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ---------- Types (mirror /api/create/session) ---------- */
type Role = "client" | "team" | "admin";
interface Actor {
  kind: Role; id: string; email: string; name: string; avatarUrl: string | null;
  organization: string; dashboardHref: string; dashboardLabel: string; permissionLevel: string;
  setupRequiredHref?: string; setupRequiredLabel?: string; accessLocked?: boolean;
}
interface Tool {
  slug: string; name: string; shortDescription: string; category: string;
  stage: "phase_1" | "phase_2" | "phase_3"; status: "active" | "maintenance" | "disabled";
  roleAccess: Role[]; creditCost: number; requiresProvider: boolean; providerKey: string | null;
  isBeta: boolean; isNew: boolean; isFeatured: boolean; supportsSimpleMode: boolean; supportsProMode: boolean;
  outputFormats: string[];
}
interface Creation {
  id: string; toolSlug: string; toolName: string; title: string;
  status: "draft" | "processing" | "ready" | "failed" | "provider_required";
  output: Record<string, unknown>; fileName: string | null; outputFormat: string | null;
  isFavorite: boolean; createdAt: string;
}
interface CreditAccount { monthlyCreditLimit: number; creditsUsed: number; storageLimitBytes: number; storageUsedBytes: number }
interface DashData {
  tools: Tool[]; favoriteToolSlugs: string[]; recentCreations: Creation[];
  creditAccount: CreditAccount; analytics: { creations: number; ready: number; providerRequired: number; storageUsedBytes: number };
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Brand: Gem, Design: Palette, Image: ImageIcon, Video: Video, Conversion: Repeat, Mockups: Box,
};

// Minimal, professional icon per tool - never a generic star/sparkle.
const TOOL_ICON: Record<string, LucideIcon> = {
  "barcode-generator": QrCode,
  "birthday-template": Cake,
  "social-media-designer": Megaphone,
  "background-remover": Eraser,
  "mockup-generator": Shirt,
  "video-compressor": Film,
  "brand-name-checker": BadgeCheck,
  "logo-ideator": Lightbulb,
  "illustration-generator": Paintbrush,
  "vector-generator": PenTool,
  "jpg-to-svg": Shapes,
  "image-restorer": ImagePlus,
  "clean-vector-tracer": Spline,
  "logo-animation": Clapperboard,
  "figma-to-illustrator": Figma,
};

function toolIcon(tool: { slug: string; category: string }): LucideIcon {
  return TOOL_ICON[tool.slug] || CATEGORY_ICON[tool.category] || Wand2;
}

/* ---------- Per-tool input forms ---------- */
type Field =
  | { name: string; label: string; type: "text" | "textarea" | "color"; placeholder?: string; optional?: boolean }
  | { name: string; label: string; type: "select"; options: string[] }
  | { name: string; label: string; type: "file"; accept: string; image?: boolean; optional?: boolean; hint?: string };

const IMG = "image/png,image/jpeg,image/webp";

const TOOL_FIELDS: Record<string, Field[]> = {
  "barcode-generator": [
    { name: "value", label: "Data or URL", type: "text", placeholder: "https://cdsspace.pro" },
    { name: "barcodeType", label: "Type", type: "select", options: ["QR", "CODE39"] },
    { name: "label", label: "Label (optional)", type: "text", placeholder: "Scan me", optional: true },
    { name: "logo", label: "Center logo (optional)", type: "file", accept: IMG, image: true, optional: true, hint: "Drop a logo to embed in a QR code." },
    { name: "foreground", label: "Foreground", type: "color" },
    { name: "background", label: "Background", type: "color" },
  ],
  "brand-name-checker": [
    { name: "brandName", label: "Brand name", type: "text", placeholder: "e.g. Northwind" },
    { name: "industry", label: "Industry", type: "text", placeholder: "e.g. fintech" },
  ],
  "logo-ideator": [
    { name: "brandName", label: "Brand name", type: "text" },
    { name: "industry", label: "Industry", type: "text" },
    { name: "targetAudience", label: "Target audience", type: "text" },
    { name: "personality", label: "Brand personality", type: "text", placeholder: "premium, bold, minimal" },
    { name: "logoType", label: "Logo type", type: "select", options: ["Wordmark", "Lettermark", "Combination", "Symbol", "Monogram", "Abstract"] },
    { name: "references", label: "Visual references (optional)", type: "file", accept: IMG, image: true, optional: true, hint: "Upload inspiration or existing marks." },
  ],
  "social-media-designer": [
    { name: "postType", label: "Post type", type: "select", options: ["Announcement", "Promotion", "Quote", "Product", "Event", "Hiring", "Testimonial", "Company Update"] },
    { name: "platform", label: "Platform", type: "select", options: ["Instagram post", "LinkedIn", "Facebook", "X", "YouTube Thumbnail"] },
    { name: "headline", label: "Headline", type: "text", placeholder: "Build with confidence" },
    { name: "supportingCopy", label: "Supporting copy", type: "textarea", placeholder: "One or two supporting lines.", optional: true },
    { name: "cta", label: "Call to action", type: "text", placeholder: "Learn more", optional: true },
    { name: "logo", label: "Brand logo (optional)", type: "file", accept: IMG, image: true, optional: true },
    { name: "photo", label: "Photo / product (optional)", type: "file", accept: IMG, image: true, optional: true },
    { name: "brandColor", label: "Brand colour", type: "color" },
  ],
  "birthday-template": [
    { name: "rawDesign", label: "Raw birthday design", type: "file", accept: IMG, image: true, hint: "Upload the existing birthday design to update." },
    { name: "personImage", label: "New person's photo", type: "file", accept: IMG, image: true, hint: "The photo to place into the design." },
    { name: "personName", label: "Name", type: "text" },
    { name: "position", label: "Position", type: "text", optional: true },
    { name: "date", label: "Date", type: "text", placeholder: "August 28" },
    { name: "message", label: "Short message", type: "textarea", optional: true },
  ],
  "mockup-generator": [
    { name: "reference", label: "Mockup to recreate (optional)", type: "file", accept: IMG, image: true, optional: true, hint: "Upload a mockup you want to recreate, or pick a base below." },
    { name: "mockupBase", label: "Mockup base", type: "select", options: ["Product package", "Shirt", "Signage", "Billboard", "Bottle", "Cup", "Storefront", "Phone", "Laptop"] },
    { name: "artwork", label: "Your design / artwork", type: "file", accept: IMG, image: true, optional: true, hint: "The artwork to place on the mockup." },
    { name: "artworkName", label: "Artwork / brand name", type: "text", optional: true },
    { name: "brandColor", label: "Brand colour", type: "color" },
  ],
  "vector-generator": [
    { name: "prompt", label: "Describe the vector", type: "text", placeholder: "Minimalist delivery icon" },
    { name: "reference", label: "Reference image (optional)", type: "file", accept: IMG, image: true, optional: true },
    { name: "detailLevel", label: "Detail", type: "select", options: ["Low", "Balanced", "High"] },
    { name: "brandColor", label: "Brand colour", type: "color" },
  ],
  "jpg-to-svg": [
    { name: "source", label: "Image to trace", type: "file", accept: IMG, image: true, hint: "Upload the JPG or PNG to convert to SVG." },
    { name: "prompt", label: "Describe the artwork (optional)", type: "text", placeholder: "Simple logo mark", optional: true },
    { name: "detailLevel", label: "Detail", type: "select", options: ["Low", "Balanced", "High"] },
  ],
  "background-remover": [
    { name: "image", label: "Image", type: "file", accept: IMG, image: true, hint: "Upload the image to isolate." },
  ],
  "image-restorer": [
    { name: "image", label: "Image to restore", type: "file", accept: IMG, image: true },
    { name: "target", label: "Target quality", type: "select", options: ["HD", "2K"] },
  ],
  "clean-vector-tracer": [
    { name: "image", label: "Artwork to trace", type: "file", accept: IMG, image: true, hint: "Logos, scanned artwork, icons, signage." },
    { name: "detailLevel", label: "Detail", type: "select", options: ["Low", "Balanced", "High"] },
  ],
  "illustration-generator": [
    { name: "prompt", label: "Describe the illustration", type: "textarea", placeholder: "A confident founder at a laptop, flat corporate style." },
    { name: "style", label: "Style", type: "select", options: ["Corporate", "Minimal", "Flat", "Isometric", "Editorial", "Technology", "African contemporary", "Line art"] },
    { name: "sample", label: "Reference sample (optional)", type: "file", accept: IMG, image: true, optional: true, hint: "Upload a sample to guide the style." },
    { name: "brandColor", label: "Brand colour", type: "color" },
  ],
  "logo-animation": [
    { name: "logo", label: "Logo (PNG/SVG)", type: "file", accept: "image/png,image/svg+xml", image: true, hint: "Transparent logo works best." },
    { name: "preset", label: "Animation", type: "select", options: ["Reveal", "Fade", "Draw", "Morph", "Scale", "Rotation", "Glow", "Particle", "Corporate", "Minimal"] },
  ],
  "video-compressor": [
    { name: "video", label: "Video file", type: "file", accept: "video/mp4,video/quicktime,video/webm", hint: "MP4, MOV, or WebM." },
    { name: "goal", label: "Compression goal", type: "select", options: ["Maximum Quality", "Balanced", "Maximum Compression", "Social Media Optimized", "WhatsApp Optimized", "Email Optimized"] },
  ],
  "figma-to-illustrator": [
    { name: "figmaFile", label: "Figma file", type: "file", accept: ".fig,.json,image/png,image/svg+xml", hint: "Upload a .fig export, JSON, or a preview image." },
    { name: "notes", label: "Notes (optional)", type: "textarea", placeholder: "Anything the converter should know.", optional: true },
  ],
};

function defaultFields(): Field[] {
  return [{ name: "prompt", label: "Describe what you need", type: "textarea", placeholder: "Add details for this tool." }];
}
function fieldDefault(f: Field): string {
  if (f.type === "color") return f.name === "background" ? "#FFFFFF" : "#0A4FE8";
  if (f.type === "select") return f.options[0];
  return "";
}
function fmtBytes(bytes: number) {
  if (!bytes || bytes < 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"]; let v = bytes, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "U";
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function outputImageSrc(output: Record<string, unknown>): string | null {
  if (typeof output.pngDataUrl === "string") return output.pngDataUrl;
  if (typeof output.dataUrl === "string") return output.dataUrl;
  if (typeof output.svg === "string") return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(output.svg)))}`;
  return null;
}
function downloadOutput(output: Record<string, unknown>, fileName: string) {
  const text = typeof output.downloadText === "string" ? output.downloadText : null;
  const mime = typeof output.mimeType === "string" ? output.mimeType : "application/octet-stream";
  let href: string;
  if (text) href = URL.createObjectURL(new Blob([text], { type: mime }));
  else if (typeof output.pngDataUrl === "string") href = output.pngDataUrl;
  else if (typeof output.dataUrl === "string") href = output.dataUrl;
  else return;
  const a = document.createElement("a");
  a.href = href; a.download = fileName || "create-output";
  document.body.appendChild(a); a.click(); a.remove();
  if (text) setTimeout(() => URL.revokeObjectURL(href), 4000);
}

const MAX_IMG_BYTES = 6 * 1024 * 1024;

/** Formats we can actually produce for a given output, client-side. */
function availableFormats(output: Record<string, unknown>): string[] {
  if (typeof output.svg === "string") return ["SVG", "PNG", "JPG"];
  if (typeof output.pngDataUrl === "string" || typeof output.dataUrl === "string") return ["PNG", "JPG"];
  if (typeof output.text === "string" || typeof output.downloadText === "string") return ["TXT"];
  return [];
}
function triggerBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}
function rasterize(src: string, mime: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1080, h = img.naturalHeight || 1080;
      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d"); if (!ctx) return resolve(null);
      if (mime === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => resolve(b), mime, 0.92);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
async function downloadInFormat(output: Record<string, unknown>, format: string, base: string) {
  const name = base || "create-output";
  const fmt = format.toUpperCase();
  if (fmt === "SVG" && typeof output.svg === "string") { triggerBlob(new Blob([output.svg], { type: "image/svg+xml" }), `${name}.svg`); return; }
  if (fmt === "TXT") {
    const text = (typeof output.text === "string" && output.text) || (typeof output.downloadText === "string" ? output.downloadText : "");
    triggerBlob(new Blob([text], { type: "text/plain" }), `${name}.txt`); return;
  }
  const mime = fmt === "JPG" ? "image/jpeg" : "image/png";
  let src: string | null = null;
  if (typeof output.svg === "string") src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(output.svg)))}`;
  else if (typeof output.pngDataUrl === "string") src = output.pngDataUrl;
  else if (typeof output.dataUrl === "string") src = output.dataUrl;
  if (!src) return;
  const blob = await rasterize(src, mime);
  if (blob) triggerBlob(blob, `${name}.${fmt === "JPG" ? "jpg" : "png"}`);
}

/* ---------- Avatar ---------- */
function Avatar({ actor, size = 32 }: { actor: Actor; size?: number }) {
  const s = { width: size, height: size };
  if (actor.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={actor.avatarUrl} alt={actor.name} style={s} className="rounded-full object-cover" />;
  }
  return (
    <span style={s} className="grid place-items-center rounded-full bg-[#0A4FE8] text-[12px] font-bold text-white">
      {initials(actor.name)}
    </span>
  );
}

export function CreateApp() {
  const [loading, setLoading] = useState(true);
  const [actor, setActor] = useState<Actor | null>(null);
  const [data, setData] = useState<DashData | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "creations">("home");
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try { const v = localStorage.getItem("create_rail_collapsed"); if (v !== null) setCollapsed(v === "1"); } catch { /* ignore */ }
  }, []);
  function toggleRail() {
    setCollapsed((c) => { const n = !c; try { localStorage.setItem("create_rail_collapsed", n ? "1" : "0"); } catch { /* ignore */ } return n; });
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/create/session", { cache: "no-store" });
    if (res.status === 401) { setAuthed(false); setLoading(false); return; }
    const json = await res.json().catch(() => ({}));
    if (json.ok) { setActor(json.actor); setData(json.data); setAuthed(true); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const favorites = useMemo(() => new Set(data?.favoriteToolSlugs || []), [data]);

  async function toggleFavorite(slug: string, next: boolean) {
    setData((d) => d ? { ...d, favoriteToolSlugs: next ? [...d.favoriteToolSlugs, slug] : d.favoriteToolSlugs.filter((s) => s !== slug) } : d);
    await fetch("/api/create/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toolSlug: slug, favorite: next }) });
  }

  // While any creation is still processing on a worker, poll for its result.
  const hasProcessing = (data?.recentCreations || []).some((c) => c.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = setInterval(async () => {
      const res = await fetch("/api/create/creations", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      if (json.ok && Array.isArray(json.creations)) {
        setData((d) => (d ? { ...d, recentCreations: json.creations } : d));
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [hasProcessing]);

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#F6F7FB]"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;
  }

  if (authed === false) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[#0A4FE8] to-[#0835AE] p-6 text-white">
        <div className="w-full max-w-md rounded-3xl bg-white/10 p-8 text-center backdrop-blur-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/15"><Wand2 className="h-7 w-7" /></div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">CDS Space</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Welcome to CREATE</h1>
          <p className="mt-2 text-sm text-white/80">Professional creative tools powered by CDS Space. A CDS Space account is required to access CREATE.</p>
          <div className="mt-6 flex flex-col gap-2.5">
            <a href="/login?next=/create" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#0A4FE8] hover:bg-blue-50">Sign In</a>
            <a href="/signup?next=/create" className="rounded-xl border border-white/40 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">Create CDS Space account</a>
          </div>
        </div>
      </div>
    );
  }

  if (actor?.accessLocked) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[#0A4FE8] to-[#0835AE] p-6 text-white">
        <div className="w-full max-w-md rounded-3xl bg-white/10 p-8 text-center backdrop-blur-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/15"><Wand2 className="h-7 w-7" /></div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">CDS Space</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">CREATE is coming soon</h1>
          <p className="mt-2 text-sm text-white/80">We are putting the finishing touches on the CREATE studio. It will be available on your account shortly.</p>
          <a href={actor.dashboardHref} className="mt-6 inline-block rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#0A4FE8] hover:bg-blue-50">Back to {actor.dashboardLabel}</a>
        </div>
      </div>
    );
  }

  const allTools = (data?.tools || []).filter((t) => actor && t.roleAccess.includes(actor.kind) && t.status !== "disabled");
  const categories = Array.from(new Set(allTools.map((t) => t.category)));
  const q = search.trim().toLowerCase();
  const filtered = allTools.filter((t) =>
    (!category || t.category === category) &&
    (!q || t.name.toLowerCase().includes(q) || t.shortDescription.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)),
  );
  const featured = allTools.filter((t) => t.isFeatured).slice(0, 6);
  const credit = data?.creditAccount;
  const shownCategories = category ? [category] : Array.from(new Set(filtered.map((t) => t.category)));

  function railHome() { setView("home"); setCategory(null); setSearch(""); setActiveTool(null); }
  function startCreate() { railHome(); setTimeout(() => searchRef.current?.focus(), 40); }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F6F7FB] text-[#0D1B39]">
      {/* Left rail - collapsible */}
      <aside className={`flex shrink-0 flex-col gap-1 border-r border-gray-100 bg-white p-3 transition-[width] duration-200 ${collapsed ? "w-[76px]" : "w-[232px]"}`}>
        {/* Brand + collapse toggle */}
        <div className={`mb-1 flex items-center ${collapsed ? "justify-center" : "justify-between pl-1"}`}>
          <button onClick={railHome} className="flex items-center gap-2" title="CREATE home">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0A4FE8] text-white shadow-sm"><Wand2 className="h-5 w-5" /></span>
            {!collapsed && <span className="text-[15px] font-black tracking-tight">CREATE</span>}
          </button>
          {!collapsed && (
            <button onClick={toggleRail} title="Collapse" className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100"><ChevronsLeft className="h-[18px] w-[18px]" /></button>
          )}
        </div>
        {collapsed && (
          <button onClick={toggleRail} title="Expand" className="mb-1 grid h-8 w-full place-items-center rounded-lg text-gray-400 hover:bg-gray-100"><ChevronsRight className="h-[18px] w-[18px]" /></button>
        )}

        {/* Primary + view */}
        <RailItem icon={Plus} label="Create" primary collapsed={collapsed} onClick={startCreate} />
        <RailItem icon={Images} label="My Creations" active={view === "creations"} collapsed={collapsed} onClick={() => setView("creations")} />

        {/* Browse by category */}
        <div className="my-2 flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-gray-100" />
          {!collapsed && <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">Browse</span>}
          <div className="h-px flex-1 bg-gray-100" />
        </div>
        <RailItem icon={LayoutGrid} label="All tools" active={view === "home" && !category} collapsed={collapsed} onClick={() => { setView("home"); setCategory(null); }} />
        {categories.map((cat) => (
          <RailItem key={cat} icon={CATEGORY_ICON[cat] || LayoutGrid} label={cat} active={category === cat && view === "home"} collapsed={collapsed}
            onClick={() => { setView("home"); setCategory(category === cat ? null : cat); }} />
        ))}

        {/* Profile */}
        <div className="mt-auto pt-2">
          {actor && (
            <a href={actor.dashboardHref} title={actor.name} className={`flex items-center rounded-xl transition hover:bg-gray-100 ${collapsed ? "justify-center py-1" : "gap-2.5 p-1.5"}`}>
              <Avatar actor={actor} size={collapsed ? 34 : 32} />
              {!collapsed && (
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[12.5px] font-bold text-[#0D1B39]">{actor.name}</p>
                  <p className="truncate text-[10px] font-semibold text-gray-400">{actor.permissionLevel}</p>
                </div>
              )}
            </a>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center gap-3 border-b border-gray-100 bg-white/70 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-2 font-black tracking-tight">
            <span className="text-[15px]">CREATE</span>
            <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#0A4FE8]">by CDS Space</span>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {credit && (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-[#0A4FE8]">{actor?.kind === "admin" ? "Unlimited" : `${Math.max(0, credit.monthlyCreditLimit - credit.creditsUsed)} credits`}</span>
                <span className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500">{fmtBytes(credit.storageUsedBytes)} / {fmtBytes(credit.storageLimitBytes)}</span>
              </div>
            )}
            <button onClick={() => setView("creations")} className={`rounded-lg px-3 py-2 text-[13px] font-semibold ${view === "creations" ? "bg-blue-50 text-[#0A4FE8]" : "text-gray-600 hover:bg-gray-100"}`}>My Creations</button>
            {/* Role-aware return to dashboard */}
            <a href={actor?.dashboardHref || "/dashboard"} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D1B39] px-3.5 py-2 text-[13px] font-bold text-white transition hover:bg-[#1a2a52]">
              <LayoutDashboard className="h-4 w-4" /> {actor?.dashboardLabel || "Dashboard"}
            </a>
            {/* Profile chip */}
            {actor && (
              <a href={actor.dashboardHref} className="flex items-center gap-2 rounded-full border border-gray-100 bg-white py-1 pl-1 pr-3 shadow-sm transition hover:border-blue-200">
                <Avatar actor={actor} size={30} />
                <div className="hidden leading-tight sm:block">
                  <p className="max-w-[130px] truncate text-[12.5px] font-bold text-[#0D1B39]">{actor.name}</p>
                  <p className="text-[10px] font-semibold text-gray-400">{actor.permissionLevel}</p>
                </div>
              </a>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
          {actor?.setupRequiredHref && (
            <a href={actor.setupRequiredHref} className="mb-5 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800">
              <span>Finish your CDS Space account setup to run CREATE tools.</span>
              <span className="rounded-lg bg-amber-500 px-3 py-1.5 text-white">{actor.setupRequiredLabel || "Continue"}</span>
            </a>
          )}

          {activeTool ? (
            <ToolPage tool={activeTool} onBack={() => setActiveTool(null)} onSaved={load} />
          ) : view === "creations" ? (
            <CreationsView data={data} onBack={() => setView("home")} reload={load} />
          ) : (
            <>
              {/* Hero */}
              <div className="mx-auto max-w-3xl pt-4 text-center">
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#0A4FE8]">Hi {actor?.name?.split(" ")[0] || "there"}</p>
                <h1 className="mt-2 text-[30px] font-black tracking-tight sm:text-[40px]">{greeting()}, start creating!</h1>
                <div className="relative mt-5">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input ref={searchRef} value={search} onChange={(e) => { setSearch(e.target.value); setCategory(null); }} placeholder="Search creative tools" className="w-full rounded-2xl border border-gray-200 bg-white py-4 pl-11 pr-4 text-[15px] shadow-[0_8px_30px_rgba(15,40,90,0.06)] outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" />
                </div>
              </div>

              {/* Quick action tiles (Magnific-style icon row) */}
              {!q && !category && featured.length > 0 && (
                <div className="mx-auto mt-8 flex max-w-4xl flex-wrap justify-center gap-3">
                  {featured.map((t) => {
                    const TIcon = toolIcon(t);
                    return (
                      <button key={t.slug} onClick={() => setActiveTool(t)} className="group flex w-[120px] flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#0A4FE8]/40 hover:shadow-md">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8] transition group-hover:bg-[#0A4FE8] group-hover:text-white"><TIcon className="h-5 w-5" /></span>
                        <span className="text-[12px] font-bold leading-tight">{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Recent creations */}
              {!q && !category && (data?.recentCreations?.length || 0) > 0 && (
                <section className="mt-10">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-[13px] font-bold uppercase tracking-wider text-gray-400">Recent creations</h2>
                    <button onClick={() => setView("creations")} className="text-[12px] font-semibold text-[#0A4FE8]">View all</button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {data!.recentCreations.slice(0, 8).map((c) => <CreationCard key={c.id} c={c} compact />)}
                  </div>
                </section>
              )}

              {/* Tools by category */}
              {(category || q) && (
                <div className="mb-4 mt-8 flex items-center gap-2">
                  <h2 className="text-[15px] font-black">{category || `Results for "${search}"`}</h2>
                  {(category || q) && <button onClick={() => { setCategory(null); setSearch(""); }} className="text-[12px] font-semibold text-[#0A4FE8]">Clear</button>}
                </div>
              )}
              {shownCategories.map((cat) => (
                <section key={cat} className="mt-8">
                  <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-400">
                    {(() => { const I = CATEGORY_ICON[cat] || LayoutGrid; return <I className="h-3.5 w-3.5" />; })()} {cat}
                  </h2>
                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.filter((t) => t.category === cat).map((t) => {
                      const fav = favorites.has(t.slug);
                      return (
                        <div key={t.slug} className="group relative rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#0A4FE8]/30 hover:shadow-md">
                          <div className="flex items-start justify-between gap-2">
                            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]">
                              {(() => { const I = toolIcon(t); return <I className="h-5 w-5" />; })()}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {t.isNew && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700">New</span>}
                              {t.isBeta && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase text-violet-700">Beta</span>}
                              {t.status === "maintenance" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-700">Setup</span>}
                              <button onClick={() => toggleFavorite(t.slug, !fav)} aria-label="Favorite" className={fav ? "text-amber-400" : "text-gray-300 hover:text-amber-400"}>
                                <Star className={`h-4 w-4 ${fav ? "fill-amber-400" : ""}`} />
                              </button>
                            </div>
                          </div>
                          <button onClick={() => setActiveTool(t)} className="mt-3 block w-full text-left">
                            <p className="text-[15px] font-bold">{t.name}</p>
                            <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-gray-500">{t.shortDescription}</p>
                            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-gray-400">
                              <span className="rounded bg-gray-100 px-1.5 py-0.5">{t.creditCost === 0 ? "Free" : `${t.creditCost} credit${t.creditCost === 1 ? "" : "s"}`}</span>
                              {t.outputFormats.slice(0, 3).map((f) => <span key={f} className="rounded bg-blue-50 px-1.5 py-0.5 text-[#0A4FE8]">{f}</span>)}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
              {filtered.length === 0 && <p className="mt-10 rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center text-sm text-gray-400">No tools match your search.</p>}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function RailItem({ icon: Icon, label, active, primary, collapsed, onClick }: { icon: LucideIcon; label: string; active?: boolean; primary?: boolean; collapsed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded-xl transition ${collapsed ? "h-11 w-11 justify-center self-center" : "h-11 w-full px-3"} ${primary ? "bg-[#0A4FE8] text-white shadow-sm hover:bg-[#083EC0]" : active ? "bg-blue-50 text-[#0A4FE8]" : "text-gray-500 hover:bg-gray-100 hover:text-[#0D1B39]"}`}
    >
      <Icon className="h-[19px] w-[19px] shrink-0" />
      {!collapsed && <span className="truncate text-[13px] font-semibold">{label}</span>}
    </button>
  );
}

/* ---------- Creation card ---------- */
function CreationCard({ c, compact = false, onReload, selectable = false, selectMode = false, selected = false, onToggleSelect }: {
  c: Creation; compact?: boolean; onReload?: () => void;
  /** When true a checkbox is offered; card clicks toggle selection once anything is selected. */
  selectable?: boolean; selectMode?: boolean; selected?: boolean; onToggleSelect?: () => void;
}) {
  const src = outputImageSrc(c.output);
  const isReport = c.output?.kind === "report";
  // Show the encoded value / link so similar creations are distinguishable.
  const value = typeof c.output?.value === "string" ? c.output.value : "";
  const subtitle = value && value !== c.title ? value : c.toolName;
  async function act(action: "duplicate" | "delete") {
    await fetch("/api/create/creations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: c.id }) });
    onReload?.();
  }
  return (
    <div
      onClick={selectMode ? onToggleSelect : undefined}
      className={`group relative shrink-0 overflow-hidden rounded-2xl border bg-white shadow-sm ${compact ? "w-44" : ""} ${selectMode ? "cursor-pointer" : ""} ${selected ? "border-[#0A4FE8] ring-2 ring-[#0A4FE8]/30" : "border-gray-100"}`}
    >
      {selectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${c.title}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
          className={`absolute left-2 top-2 z-10 grid h-5 w-5 place-items-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A4FE8]/40 ${selected ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-gray-300 bg-white/90 text-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="grid aspect-square place-items-center bg-[#F6F7FB] p-3">
        {src ? <img src={src} alt={c.title} className="max-h-full max-w-full object-contain" />
          : c.status === "processing" ? <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0A4FE8]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing</span>
          : c.status === "failed" ? <span className="rounded bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase text-rose-600">Failed</span>
          : isReport ? <span className="text-[11px] font-semibold text-gray-400">Text output</span>
          : <span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">Setup needed</span>}
      </div>
      <div className="p-2.5">
        <p className="truncate text-[12px] font-bold" title={c.title}>{c.title}</p>
        <p className="truncate text-[10.5px] text-gray-400" title={subtitle}>{subtitle}</p>
        {!compact && !selectMode && (
          <div className="mt-2 flex items-center gap-1.5">
            {c.status === "ready" && <button onClick={() => downloadOutput(c.output, c.fileName || "create-output")} className="inline-flex items-center gap-1 rounded-lg bg-[#0A4FE8] px-2 py-1 text-[11px] font-bold text-white"><Download className="h-3 w-3" /></button>}
            <button onClick={() => act("duplicate")} className="rounded-lg border border-gray-200 px-2 py-1 text-gray-500 hover:bg-gray-50"><Copy className="h-3 w-3" /></button>
            <button onClick={() => act("delete")} className="rounded-lg border border-gray-200 px-2 py-1 text-gray-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-3 w-3" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- My Creations ---------- */
function CreationsView({ data, onBack, reload }: { data: DashData | null; onBack: () => void; reload: () => void }) {
  const items = useMemo(() => data?.recentCreations || [], [data]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | "download" | "duplicate" | "delete">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Drop selections for creations that no longer exist after a reload.
  useEffect(() => {
    setSelected((prev) => prev.filter((id) => items.some((c) => c.id === id)));
  }, [items]);

  const selecting = selected.length > 0;
  const allSelected = items.length > 0 && selected.length === items.length;
  const selectedItems = items.filter((c) => selected.includes(c.id));
  const downloadable = selectedItems.filter((c) => c.status === "ready");

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  const clear = () => { setSelected([]); setConfirmDelete(false); };

  async function bulk(action: "duplicate" | "delete") {
    if (!selected.length) return;
    setBusy(action);
    try {
      await fetch("/api/create/creations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: selected }),
      });
      clear();
      reload();
    } finally { setBusy(null); }
  }

  async function bulkDownload() {
    if (!downloadable.length) return;
    setBusy("download");
    try {
      // Browsers throttle simultaneous downloads, so space them out slightly.
      for (const c of downloadable) {
        downloadOutput(c.output, c.fileName || c.title || "create-output");
        await new Promise((r) => setTimeout(r, 350));
      }
    } finally { setBusy(null); }
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-[#0A4FE8]"><ArrowLeft className="h-4 w-4" /> Back</button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-black tracking-tight">My Creations</h1>
          <p className="mt-1 text-sm text-gray-500">{items.length} recent item{items.length === 1 ? "" : "s"}. Select items for bulk actions, or download, duplicate, and remove one at a time.</p>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => setSelected(allSelected ? [] : items.map((c) => c.id))}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50"
          >
            {allSelected ? "Clear selection" : "Select all"}
          </button>
        )}
      </div>

      {selecting && (
        <div className="sticky top-2 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-white/95 p-2.5 shadow-lg backdrop-blur">
          <span className="px-1.5 text-[13px] font-bold text-[#0D1B39]">{selected.length} selected</span>
          <button
            onClick={bulkDownload}
            disabled={!downloadable.length || busy !== null}
            title={downloadable.length ? undefined : "None of the selected items are ready to download"}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A4FE8] px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-40"
          >
            {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download{downloadable.length ? ` (${downloadable.length})` : ""}
          </button>
          <button
            onClick={() => void bulk("duplicate")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            {busy === "duplicate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} Duplicate
          </button>
          {confirmDelete ? (
            <span className="inline-flex items-center gap-1.5">
              <button
                onClick={() => void bulk("delete")}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-[12.5px] font-bold text-white hover:bg-rose-700 disabled:opacity-40"
              >
                {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete {selected.length}?
              </button>
              <button onClick={() => setConfirmDelete(false)} className="rounded-xl px-2 py-2 text-[12.5px] font-semibold text-gray-500 hover:bg-gray-50">Cancel</button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-bold text-gray-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          <button onClick={clear} className="ml-auto inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold text-gray-500 hover:bg-gray-100"><X className="h-3.5 w-3.5" /> Clear</button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center text-sm text-gray-400">No creations yet. Run a tool to get started.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((c) => (
            <CreationCard
              key={c.id}
              c={c}
              onReload={reload}
              selectable
              selectMode={selecting}
              selected={selected.includes(c.id)}
              onToggleSelect={() => toggle(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- File upload input ---------- */
function FileInput({ field, dataUrl, fileName, onFile, onClear }: {
  field: Extract<Field, { type: "file" }>; dataUrl: string; fileName: string;
  onFile: (dataUrl: string, name: string) => void; onClear: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  function handle(file: File) {
    setErr(null);
    if (field.image && !file.type.startsWith("image/")) { setErr("Please choose an image file."); return; }
    if (field.image && file.size > MAX_IMG_BYTES) { setErr("Image is larger than 6MB - use a smaller file."); return; }
    if (field.image) {
      const reader = new FileReader();
      reader.onload = () => onFile(String(reader.result || ""), file.name);
      reader.onerror = () => setErr("Could not read that file.");
      reader.readAsDataURL(file);
    } else {
      // Large / non-image files (figma, video) are captured by name; the bytes
      // are handled by the processing provider, not inlined into the request.
      onFile("", file.name);
    }
  }
  return (
    <div className="mt-1.5">
      {(dataUrl || fileName) ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-2">
          {dataUrl ? <img src={dataUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
            : <span className="grid h-14 w-14 place-items-center rounded-lg bg-white text-gray-400"><Upload className="h-5 w-5" /></span>}
          <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold text-[#0D1B39]">{fileName || "Uploaded"}</p><p className="truncate text-[10px] text-gray-400">{field.hint || "Ready"}</p></div>
          <button type="button" onClick={() => { onClear(); setErr(null); }} className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-white hover:text-rose-500"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-5 text-center transition hover:border-blue-300 hover:bg-blue-50/40">
          <Upload className="h-5 w-5 text-[#0A4FE8]" />
          <span className="text-[12px] font-semibold text-[#0D1B39]">Upload {field.label.replace(/\s*\(optional\)/i, "").toLowerCase()}</span>
          {field.hint && <span className="text-[10.5px] text-gray-400">{field.hint}</span>}
        </button>
      )}
      <input ref={inputRef} type="file" accept={field.accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.currentTarget.value = ""; }} />
      {err && <p className="mt-1 text-[11px] font-medium text-rose-600">{err}</p>}
    </div>
  );
}

/* ---------- Download format picker ---------- */
function DownloadMenu({ output, base }: { output: Record<string, unknown>; base: string }) {
  const [open, setOpen] = useState(false);
  const formats = availableFormats(output);
  if (!formats.length) {
    return <button onClick={() => downloadOutput(output, base)} className="inline-flex items-center gap-2 rounded-xl bg-[#0D1B39] px-4 py-2.5 text-[13px] font-bold text-white"><Download className="h-4 w-4" /> Download</button>;
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-xl bg-[#0D1B39] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#1a2a52]">
        <Download className="h-4 w-4" /> Download <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Choose format</p>
            {formats.map((f) => (
              <button key={f} onClick={() => { void downloadInFormat(output, f, base); setOpen(false); }} className="flex w-full items-center justify-between px-3 py-2 text-[13px] font-semibold text-[#0D1B39] hover:bg-blue-50">
                {f} <Download className="h-3.5 w-3.5 text-gray-300" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Full-page tool ---------- */
function ToolPage({ tool, onBack, onSaved }: { tool: Tool; onBack: () => void; onSaved: () => void }) {
  const fields = TOOL_FIELDS[tool.slug] || defaultFields();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, fieldDefault(f)])));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; output: Record<string, unknown>; fileName?: string } | null>(null);
  const Icon = toolIcon(tool);
  const setVal = (name: string, v: string) => setValues((s) => ({ ...s, [name]: v }));

  async function run() {
    for (const f of fields) {
      const optional = "optional" in f && f.optional;
      const empty = f.type === "file" ? (!values[f.name] && !values[`${f.name}__name`]) : !values[f.name]?.trim();
      if (!optional && f.type !== "color" && empty) { setError(`Please provide ${f.label.replace(/\s*\(optional\)/i, "").toLowerCase()}.`); return; }
    }
    setRunning(true); setError(null); setResult(null);
    const res = await fetch(`/api/create/tools/${tool.slug}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    const json = await res.json().catch(() => ({}));
    setRunning(false);
    if (!res.ok) { setError(json.error || "CREATE could not run this tool."); return; }
    setResult({ status: json.status, output: json.output || {}, fileName: json.creation?.fileName || undefined });
    onSaved();
  }

  const src = result ? outputImageSrc(result.output) : null;
  const reportText = result && typeof result.output.text === "string" ? result.output.text : null;
  const base = (result?.fileName || tool.slug).replace(/\.[^.]+$/, "");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-gray-600 transition hover:border-blue-200 hover:bg-blue-50"><ArrowLeft className="h-4 w-4" /> Back to tools</button>
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          <span className="rounded bg-gray-100 px-2 py-1 text-gray-500">{tool.creditCost === 0 ? "Free" : `${tool.creditCost} credit${tool.creditCost === 1 ? "" : "s"}`}</span>
          {tool.isBeta && <span className="rounded-full bg-violet-50 px-2 py-1 uppercase text-violet-700">Beta</span>}
          {tool.status === "maintenance" && <span className="rounded-full bg-amber-50 px-2 py-1 uppercase text-amber-700">Setup</span>}
        </div>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><Icon className="h-6 w-6" /></span>
        <div><h1 className="text-[24px] font-black tracking-tight">{tool.name}</h1><p className="text-[13px] text-gray-500">{tool.shortDescription}</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">Inputs</p>
          <div className="space-y-3.5">
            {fields.map((f) => {
              // Line barcodes (Code 39) have no room for a centre logo.
              if (tool.slug === "barcode-generator" && f.name === "logo" && values.barcodeType === "CODE39") return null;
              return (
              <div key={f.name} className="text-[12px] font-semibold text-gray-600">
                <div className="flex items-center gap-2">{f.label}{("optional" in f && f.optional) && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-400">Optional</span>}</div>
                {f.type === "file" ? (
                  <FileInput field={f} dataUrl={values[f.name] || ""} fileName={values[`${f.name}__name`] || ""}
                    onFile={(d, n) => { setVal(f.name, d); setVal(`${f.name}__name`, n); }}
                    onClear={() => { setVal(f.name, ""); setVal(`${f.name}__name`, ""); }} />
                ) : f.type === "textarea" ? (
                  <textarea value={values[f.name]} onChange={(e) => setVal(f.name, e.target.value)} placeholder={"placeholder" in f ? f.placeholder : ""} rows={3} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] outline-none focus:border-blue-300 focus:bg-white" />
                ) : f.type === "select" ? (
                  <select value={values[f.name]} onChange={(e) => setVal(f.name, e.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-blue-300">
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === "color" ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <input type="color" value={values[f.name]} onChange={(e) => setVal(f.name, e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white" />
                    <span className="font-mono text-[12px] text-gray-500">{values[f.name]}</span>
                  </div>
                ) : (
                  <input value={values[f.name]} onChange={(e) => setVal(f.name, e.target.value)} placeholder={"placeholder" in f ? f.placeholder : ""} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-blue-300 focus:bg-white" />
                )}
              </div>
              );
            })}
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-600">{error}</p>}
            <button onClick={run} disabled={running} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-[14px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-60">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {running ? "Generating..." : `Generate${tool.creditCost ? ` (${tool.creditCost} credit${tool.creditCost === 1 ? "" : "s"})` : ""}`}
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="h-fit rounded-2xl border border-gray-100 bg-[#F6F7FB] p-5 shadow-sm lg:sticky lg:top-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Preview</p>
          <div className="grid min-h-[320px] place-items-center rounded-xl border border-gray-100 bg-white p-3">
            {!result ? <span className="text-[12px] text-gray-400">Your result appears here.</span>
              : result.status === "provider_required" ? (
                <div className="text-center">
                  <span className="mx-auto mb-2 block w-fit rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase text-amber-700">Setup needed</span>
                  <p className="text-[12.5px] text-gray-600">{String(result.output.message || "Provider not connected yet.")}</p>
                </div>
              ) : result.status === "processing" ? (
                <div className="text-center">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-[#0A4FE8]" />
                  <span className="mx-auto mb-2 block w-fit rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase text-[#0A4FE8]">Processing</span>
                  <p className="text-[12.5px] text-gray-600">{String(result.output.message || "Your file is being processed. It will appear in My Creations when ready.")}</p>
                </div>
              ) : src ? <img src={src} alt="Result" className="max-h-[420px] max-w-full object-contain" />
              : reportText ? <pre className="max-h-[420px] w-full overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed text-[#0D1B39]">{reportText}</pre>
              : <span className="text-[12px] text-gray-400">Saved to My Creations.</span>}
          </div>
          {result && result.status === "ready" && (
            <div className="mt-3 flex items-center gap-2">
              <DownloadMenu output={result.output} base={base} />
              <button onClick={() => setResult(null)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-bold text-gray-600 hover:bg-gray-50"><Check className="h-4 w-4" /> Create again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
