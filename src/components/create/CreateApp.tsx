"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BadgeCheck, Box, Cake, Check, ChevronDown, ChevronsLeft, ChevronsRight, Clapperboard,
  AtSign, Building2, CircleAlert, CircleCheck, CircleHelp, Copy, Download, Eraser, ExternalLink, Figma, FileText, Film, Gem, Globe2, ImageIcon, ImagePlus, Images, LayoutDashboard,
  LayoutGrid, Lightbulb, Loader2, Megaphone, Paintbrush, Palette, PenTool, Plus, QrCode, Repeat,
  LockKeyhole, Moon, PenLine, Search, Shapes, Shirt, Spline, Star, Sun, Trash2, Upload, Video, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { LetterheadStudio } from "@/components/create/LetterheadStudio";

/* ---------- Types (mirror /api/create/session) ---------- */
type Role = "client" | "team" | "admin";
function createApiPath(path: string, workspace: Role) {
  return `${path}${path.includes("?") ? "&" : "?"}workspace=${workspace}`;
}
interface Actor {
  kind: Role; email: string; name: string; avatarUrl: string | null;
  organization: string; dashboardHref: string; dashboardLabel: string; permissionLevel: string;
  workspaceReference: string;
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
interface AdvertBanner { imageUrl: string | null; altText: string; targetUrl: string | null; isActive: boolean; width: number | null; height: number | null; updatedAt: string | null }
interface DashData {
  tools: Tool[]; favoriteToolSlugs: string[]; recentCreations: Creation[];
  advertBanner?: AdvertBanner | null;
  creditAccount: CreditAccount; analytics: { creations: number; ready: number; providerRequired: number; storageUsedBytes: number };
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Brand: Gem, Design: Palette, Image: ImageIcon, Video: Video, Documents: FileText, Conversion: Repeat, Mockups: Box,
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
  "official-letterhead": FileText,
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
  return TOOL_ICON[tool.slug] || CATEGORY_ICON[tool.category] || PenLine;
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
    { name: "markets", label: "Priority countries or markets", type: "text", placeholder: "e.g. Nigeria, UK, United States" },
    { name: "domainExtensions", label: "Extra domain endings (optional)", type: "text", placeholder: "e.g. app, design, studio", optional: true },
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

export function CreateApp({
  initial,
  initialTheme = "light",
  workspaceKind = "client",
}: {
  /** Resolved on the server so the studio paints without a loading screen. */
  initial?: { authed: boolean; actor: Actor | null; data: DashData | null };
  initialTheme?: "light" | "dark";
  workspaceKind?: Role;
} = {}) {
  const [loading, setLoading] = useState(!initial);
  const [actor, setActor] = useState<Actor | null>(initial?.actor ?? null);
  const [data, setData] = useState<DashData | null>(initial?.data ?? null);
  const [authed, setAuthed] = useState<boolean | null>(initial ? initial.authed : null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "creations">("home");
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [collapsed, setCollapsed] = useState(workspaceKind === "client");
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const railStorageKey = `create_rail_collapsed_${workspaceKind}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(railStorageKey);
      setCollapsed(saved === null ? workspaceKind === "client" : saved === "1");
    } catch {
      setCollapsed(workspaceKind === "client");
    }
  }, [railStorageKey, workspaceKind]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("create_theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch { /* use the initial theme */ }
  }, []);
  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try { localStorage.setItem("create_theme", next); } catch { /* ignore */ }
      return next;
    });
  }
  function toggleRail() {
    setCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem(railStorageKey, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  const load = useCallback(async () => {
    const res = await fetch(createApiPath("/api/create/session", workspaceKind), { cache: "no-store" });
    if (res.status === 401) { setAuthed(false); setLoading(false); return; }
    const json = await res.json().catch(() => ({}));
    if (json.ok) { setActor(json.actor); setData(json.data); setAuthed(true); }
    setLoading(false);
  }, [workspaceKind]);
  // Only when the server could not hand the data over already.
  const hasInitial = Boolean(initial);
  useEffect(() => { if (!hasInitial) void load(); }, [load, hasInitial]);

  const favorites = useMemo(() => new Set(data?.favoriteToolSlugs || []), [data]);

  async function toggleFavorite(slug: string, next: boolean) {
    setData((d) => d ? { ...d, favoriteToolSlugs: next ? [...d.favoriteToolSlugs, slug] : d.favoriteToolSlugs.filter((s) => s !== slug) } : d);
    await fetch(createApiPath("/api/create/favorites", workspaceKind), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toolSlug: slug, favorite: next }) });
  }

  // While any creation is still processing on a worker, poll for its result.
  const hasProcessing = (data?.recentCreations || []).some((c) => c.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = setInterval(async () => {
      const res = await fetch(createApiPath("/api/create/creations", workspaceKind), { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      if (json.ok && Array.isArray(json.creations)) {
        setData((d) => (d ? { ...d, recentCreations: json.creations } : d));
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [hasProcessing, workspaceKind]);

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#F6F7FB]"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;
  }

  if (authed === false) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0A4FE8] p-6 text-white">
        <div className="w-full max-w-md rounded-3xl bg-white/10 p-8 text-center backdrop-blur-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/15"><PenLine className="h-7 w-7" /></div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">CDS Space</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Welcome to CREATE</h1>
          <p className="mt-2 text-sm text-white/80">Professional creative tools powered by CDS Space. A CDS Space account is required to access CREATE.</p>
          <div className="mt-6 flex flex-col gap-2.5">
            <Link href={workspaceKind === "admin" ? "/admin/login" : workspaceKind === "team" ? "/team/login" : `/login?next=${encodeURIComponent("/create?workspace=client")}`} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#0A4FE8] hover:bg-blue-50">Sign in</Link>
            {workspaceKind === "client" && <Link href={`/signup?next=${encodeURIComponent("/create?workspace=client")}`} className="rounded-xl border border-white/40 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">Create CDS Space account</Link>}
          </div>
        </div>
      </div>
    );
  }

  if (actor?.accessLocked) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0A4FE8] p-6 text-white">
        <div className="w-full max-w-md rounded-3xl bg-white/10 p-8 text-center backdrop-blur-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/15"><PenLine className="h-7 w-7" /></div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">CDS Space</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">CREATE is coming soon</h1>
          <p className="mt-2 text-sm text-white/80">We are putting the finishing touches on the CREATE studio. It will be available on your account shortly.</p>
          <Link href={actor.dashboardHref} className="mt-6 inline-block rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#0A4FE8] hover:bg-blue-50">Back to {actor.dashboardLabel}</Link>
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
  const featured = allTools.filter((t) => t.isFeatured && t.slug !== "official-letterhead").slice(0, 4);
  const letterheadTool = allTools.find((t) => t.slug === "official-letterhead") || null;
  const credit = data?.creditAccount;
  const shownCategories = category ? [category] : Array.from(new Set(filtered.map((t) => t.category)));
  const dark = theme === "dark";

  function railHome() { setView("home"); setCategory(null); setSearch(""); setActiveTool(null); }
  function startCreate() { railHome(); setTimeout(() => searchRef.current?.focus(), 40); }

  return (
    <div className={`flex h-[100dvh] w-full max-w-full overflow-hidden transition-colors duration-300 ${dark ? "bg-[#050D20] text-[#F4F7FF]" : "bg-[#F4F7FC] text-[#0D1B39]"}`} data-create-theme={theme}>
      {/* Left rail - collapsible */}
      <aside className={`hidden shrink-0 flex-col gap-1 border-r p-3 transition-[width,background-color,border-color] duration-300 md:flex ${dark ? "border-[#1A315E] bg-[#09142D] shadow-[10px_0_38px_rgba(0,20,70,0.22)]" : "border-[#E6ECF5] bg-white"} ${collapsed ? "w-[76px]" : "w-[240px]"}`}>
        {/* Brand + collapse toggle */}
        <div className={`mb-1 flex items-center ${collapsed ? "justify-center" : "justify-between pl-1"}`}>
          <button onClick={railHome} className="flex items-center gap-2" title="CREATE home">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0A4FE8] text-white shadow-sm"><PenLine className="h-5 w-5" /></span>
            {!collapsed && <span className="text-[15px] font-black tracking-tight">CREATE</span>}
          </button>
          {!collapsed && (
            <button onClick={toggleRail} title="Collapse" className={`grid h-8 w-8 place-items-center rounded-lg text-gray-400 ${dark ? "hover:bg-white/[0.07]" : "hover:bg-gray-100"}`}><ChevronsLeft className="h-[18px] w-[18px]" /></button>
          )}
        </div>
        {collapsed && (
          <button onClick={toggleRail} title="Expand" className={`mb-1 grid h-8 w-full place-items-center rounded-lg text-gray-400 ${dark ? "hover:bg-white/[0.07]" : "hover:bg-gray-100"}`}><ChevronsRight className="h-[18px] w-[18px]" /></button>
        )}

        {/* Primary + view */}
        <RailItem icon={Plus} label="Create" primary dark={dark} collapsed={collapsed} onClick={startCreate} />
        {letterheadTool && (
          <RailItem icon={FileText} label="Create letterhead" pinned dark={dark} collapsed={collapsed} onClick={() => setActiveTool(letterheadTool)} />
        )}
        <RailItem icon={Images} label="My creations" active={view === "creations"} dark={dark} collapsed={collapsed} onClick={() => setView("creations")} />

        {/* Browse by category */}
        <div className="my-2 flex items-center gap-2 px-1">
          <div className={`h-px flex-1 ${dark ? "bg-white/[0.07]" : "bg-gray-100"}`} />
          {!collapsed && <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">Browse</span>}
          <div className={`h-px flex-1 ${dark ? "bg-white/[0.07]" : "bg-gray-100"}`} />
        </div>
        <RailItem icon={LayoutGrid} label="All tools" active={view === "home" && !category} dark={dark} collapsed={collapsed} onClick={() => { setView("home"); setCategory(null); }} />
        {categories.map((cat) => (
          <RailItem key={cat} icon={CATEGORY_ICON[cat] || LayoutGrid} label={cat} active={category === cat && view === "home"} dark={dark} collapsed={collapsed}
            onClick={() => { setView("home"); setCategory(category === cat ? null : cat); }} />
        ))}

        {/* Profile */}
        <div className="mt-auto pt-2">
          {actor && (
            <Link href={actor.dashboardHref} title={actor.name} className={`flex items-center rounded-xl transition ${dark ? "hover:bg-white/[0.07]" : "hover:bg-gray-100"} ${collapsed ? "justify-center py-1" : "gap-2.5 p-1.5"}`}>
              <Avatar actor={actor} size={collapsed ? 34 : 32} />
              {!collapsed && (
                <div className="min-w-0 leading-tight">
                  <p className={`truncate text-[12.5px] font-bold ${dark ? "text-white" : "text-[#0D1B39]"}`}>{actor.name}</p>
                  <p className="truncate text-[10px] font-semibold text-gray-400">{actor.permissionLevel}</p>
                </div>
              )}
            </Link>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className={`flex min-h-16 max-w-full items-center gap-2 overflow-hidden border-b px-3 py-3 transition-colors duration-300 sm:gap-3 sm:px-6 ${dark ? "border-[#1A315E] bg-[#09142D] shadow-[0_10px_34px_rgba(0,19,64,0.22)]" : "border-[#E6ECF5] bg-white"}`}>
          <div className="flex items-center gap-2 font-black tracking-tight">
            <button onClick={railHome} className="grid h-9 w-9 place-items-center rounded-xl bg-[#0A4FE8] text-white md:hidden" aria-label="CREATE home"><PenLine className="h-5 w-5" /></button>
            <span className="text-[15px]">CREATE</span>
            <span className="hidden rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-[#0A4FE8] sm:inline">by CDS Space</span>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {actor && (
              <span className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold xl:inline-flex ${dark ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "bg-emerald-50 text-emerald-700"}`} title="Creations and files are isolated to this signed-in account. The reference is not used for authentication.">
                <LockKeyhole className="h-3.5 w-3.5" /> Private workspace <span className="font-mono">{actor.workspaceReference}</span>
              </span>
            )}
            {credit && (
              <div className="hidden items-center gap-2 lg:flex">
                <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-[#0A4FE8]">{actor?.kind === "admin" ? "Premium" : `${Math.max(0, credit.monthlyCreditLimit - credit.creditsUsed)} credits`}</span>
                <span className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500">{fmtBytes(credit.storageUsedBytes)} / {fmtBytes(credit.storageLimitBytes)}</span>
              </div>
            )}
            {letterheadTool && <button onClick={() => setActiveTool(letterheadTool)} className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8] md:hidden" aria-label="Create letterhead"><FileText className="h-[18px] w-[18px]" /></button>}
            <button onClick={() => setView("creations")} className={`grid h-9 w-9 place-items-center rounded-xl sm:hidden ${view === "creations" ? "bg-blue-50 text-[#0A4FE8]" : dark ? "text-slate-300" : "text-slate-500"}`} aria-label="My creations"><Images className="h-[18px] w-[18px]" /></button>
            <button onClick={() => setView("creations")} className={`hidden rounded-lg px-3 py-2 text-[13px] font-semibold sm:block ${view === "creations" ? "bg-blue-50 text-[#0A4FE8]" : dark ? "text-slate-300 hover:bg-white/[0.07]" : "text-gray-600 hover:bg-gray-100"}`}>My creations</button>
            <button onClick={toggleTheme} aria-label={`Use ${dark ? "light" : "dark"} mode`} title={`Use ${dark ? "light" : "dark"} mode`} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition ${dark ? "border-[#315CA8] bg-[#0D1D3E] text-amber-200 shadow-[0_0_18px_rgba(43,105,255,0.22)] hover:border-[#4D7DD8] hover:bg-[#12264E]" : "border-[#E2E9F4] bg-white text-slate-600 hover:bg-slate-50"}`}>
              {dark ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
            </button>
            {/* Role-aware return to dashboard */}
            <Link href={actor?.dashboardHref || "/dashboard"} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D1B39] px-3.5 py-2 text-[13px] font-bold text-white transition hover:bg-[#1a2a52]">
              <LayoutDashboard className="h-4 w-4" /> <span className="hidden xl:inline">{actor?.dashboardLabel || "Dashboard"}</span>
            </Link>
            {/* Profile chip */}
            {actor && (
              <Link href={actor.dashboardHref} className={`hidden items-center gap-2 rounded-full border py-1 pl-1 pr-3 shadow-sm transition xl:flex ${dark ? "border-white/10 bg-white/[0.05] hover:border-blue-400/40" : "border-gray-100 bg-white hover:border-blue-200"}`}>
                <Avatar actor={actor} size={30} />
                <div className="hidden leading-tight sm:block">
                  <p className={`max-w-[130px] truncate text-[12.5px] font-bold ${dark ? "text-white" : "text-[#0D1B39]"}`}>{actor.name}</p>
                  <p className="text-[10px] font-semibold text-gray-400">{actor.permissionLevel}</p>
                </div>
              </Link>
            )}
          </div>
        </header>

        <main className="min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-7 sm:py-7 lg:px-10">
          {actor?.setupRequiredHref && (
            <Link href={actor.setupRequiredHref} className="mb-5 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800">
              <span>Finish your CDS Space account setup to run CREATE tools.</span>
              <span className="rounded-lg bg-amber-500 px-3 py-1.5 text-white">{actor.setupRequiredLabel || "Continue"}</span>
            </Link>
          )}

          {activeTool ? (
            activeTool.slug === "official-letterhead"
              ? <LetterheadStudio workspaceKind={workspaceKind} onBack={() => setActiveTool(null)} />
              : <ToolPage workspaceKind={workspaceKind} tool={activeTool} onBack={() => setActiveTool(null)} onSaved={load} />
          ) : view === "creations" ? (
            <CreationsView workspaceKind={workspaceKind} data={data} dark={dark} onBack={() => setView("home")} reload={load} />
          ) : (
            <div className="mx-auto w-full max-w-[1380px]">
              {/* Welcome and primary action */}
              <section className={`grid overflow-hidden rounded-[24px] border transition-colors duration-300 lg:grid-cols-[1.45fr_0.75fr] ${dark ? "border-[#203C70] bg-[#0C1833] shadow-[0_0_0_1px_rgba(56,112,230,0.08),0_24px_70px_rgba(0,12,42,0.52),0_0_44px_rgba(22,82,220,0.08)]" : "border-[#E2E9F4] bg-white shadow-[0_14px_45px_rgba(26,54,93,0.06)]"}`}>
                <div className="p-6 sm:p-8 lg:p-10">
                  <p className="text-[13px] font-semibold text-[#0A4FE8]">{greeting()}, {actor?.name?.split(" ")[0] || "there"}</p>
                  <h1 className="mt-2 max-w-2xl text-[30px] font-bold leading-[1.12] tracking-[-0.035em] sm:text-[38px]">What would you like to create?</h1>
                  <p className={`mt-3 max-w-xl text-[14px] leading-6 ${dark ? "text-slate-400" : "text-slate-500"}`}>Start with a professional document or find the right creative tool for your next task.</p>
                  <div className="relative mt-6 max-w-2xl">
                    <Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                    <input ref={searchRef} value={search} onChange={(e) => { setSearch(e.target.value); setCategory(null); }} placeholder="Search tools, documents and formats" className={`h-14 w-full rounded-xl border pl-12 pr-4 text-[14px] outline-none transition placeholder:text-slate-400 focus:border-[#3778FF] focus:ring-4 focus:ring-blue-500/10 ${dark ? "border-[#213D72] bg-[#07132B] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_10px_28px_rgba(0,7,25,0.28)] focus:bg-[#08162F] focus:shadow-[0_0_22px_rgba(35,96,235,0.18)]" : "border-[#DCE4F0] bg-[#FAFCFF] shadow-sm focus:bg-white"}`} />
                  </div>
                </div>
                {letterheadTool && (
                  <button onClick={() => setActiveTool(letterheadTool)} className={`group relative m-3 flex min-h-[210px] flex-col justify-between overflow-hidden rounded-[20px] bg-[#0A4FE8] p-6 text-left text-white transition hover:bg-[#0844CC] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 sm:m-4 sm:p-7 ${dark ? "border border-[#5C8CFF]/45 shadow-[0_0_0_1px_rgba(108,151,255,0.14),0_0_34px_rgba(10,79,232,0.46),0_22px_50px_rgba(0,16,65,0.48)] hover:shadow-[0_0_0_1px_rgba(130,169,255,0.3),0_0_44px_rgba(10,79,232,0.58),0_24px_54px_rgba(0,16,65,0.5)]" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15"><FileText className="h-6 w-6" /></span>
                      <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold">Pinned</span>
                    </div>
                    <div className="mt-8">
                      <p className="text-[20px] font-bold tracking-tight">Create official letterhead</p>
                      <p className="mt-2 max-w-sm text-[13px] leading-5 text-white/75">Draft, sign and export exact A4 or Legal documents as polished PDFs.</p>
                      <span className="mt-5 inline-flex items-center gap-2 text-[13px] font-semibold">Open letterhead studio <ExternalLink className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
                    </div>
                  </button>
                )}
              </section>

              {/* Mobile category navigation */}
              <div className="mt-5 flex max-w-full flex-wrap gap-2 md:hidden">
                <button onClick={() => { setCategory(null); setView("home"); }} className={`rounded-full px-4 py-2 text-[12px] font-semibold ${!category ? "bg-[#0A4FE8] text-white" : dark ? "border border-white/10 bg-white/[0.05] text-slate-300" : "border border-[#DCE4F0] bg-white text-slate-600"}`}>All tools</button>
                {categories.map((cat) => <button key={cat} onClick={() => { setCategory(cat); setView("home"); }} className={`rounded-full px-4 py-2 text-[12px] font-semibold ${category === cat ? "bg-[#0A4FE8] text-white" : dark ? "border border-white/10 bg-white/[0.05] text-slate-300" : "border border-[#DCE4F0] bg-white text-slate-600"}`}>{cat}</button>)}
              </div>

              {/* Useful shortcuts */}
              {!q && !category && featured.length > 0 && (
                <section className="mt-7">
                  <div className="mb-3 flex items-end justify-between gap-4">
                    <div><h2 className="text-[17px] font-bold">Quick start</h2><p className={`mt-0.5 text-[12px] ${dark ? "text-slate-400" : "text-slate-500"}`}>Your most useful tools, ready to open.</p></div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {featured.map((t) => {
                      const TIcon = toolIcon(t);
                      return (
                        <button key={t.slug} onClick={() => setActiveTool(t)} className={`group flex min-w-0 items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${dark ? "border-[#1D396B] bg-[#0C1833] shadow-[0_12px_30px_rgba(0,8,30,0.28)] hover:border-[#3974E8] hover:shadow-[0_0_24px_rgba(10,79,232,0.18),0_14px_34px_rgba(0,8,30,0.34)]" : "border-[#E2E9F4] bg-white shadow-sm hover:border-[#0A4FE8]/35 hover:shadow-md"}`}>
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8] transition group-hover:bg-[#0A4FE8] group-hover:text-white"><TIcon className="h-5 w-5" /></span>
                          <span className="min-w-0"><span className="block truncate text-[13px] font-bold">{t.name}</span><span className="mt-0.5 block truncate text-[11px] text-slate-400">{t.category}</span></span>
                          <ChevronDown className="ml-auto h-4 w-4 -rotate-90 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#0A4FE8]" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {!q && !category && data?.advertBanner?.isActive && data.advertBanner.imageUrl && (
                <CreateAdvertBanner banner={data.advertBanner} dark={dark} />
              )}

              {/* Recent creations */}
              {!q && !category && (data?.recentCreations?.length || 0) > 0 && (
                <section className="mt-8">
                  <div className="mb-3 flex items-center justify-between">
                    <div><h2 className="text-[17px] font-bold">Recent creations</h2><p className={`mt-0.5 text-[12px] ${dark ? "text-slate-400" : "text-slate-500"}`}>Continue where you left off.</p></div>
                    <button onClick={() => setView("creations")} className="rounded-lg px-3 py-2 text-[12px] font-semibold text-[#0A4FE8] hover:bg-blue-50">View all</button>
                  </div>
                  <div className="grid max-w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                    {data!.recentCreations.slice(0, 6).map((c) => <CreationCard workspaceKind={workspaceKind} key={c.id} c={c} compact dark={dark} />)}
                  </div>
                </section>
              )}

              {/* Tools by category */}
              {(category || q) && (
                <div className="mb-4 mt-8 flex items-center gap-2">
                  <h2 className="text-[18px] font-bold">{category || `Results for "${search}"`}</h2>
                  {(category || q) && <button onClick={() => { setCategory(null); setSearch(""); }} className="text-[12px] font-semibold text-[#0A4FE8]">Clear</button>}
                </div>
              )}
              {shownCategories.map((cat) => (
                <section key={cat} className="mt-8">
                  <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-slate-700">
                    {(() => { const I = CATEGORY_ICON[cat] || LayoutGrid; return <I className="h-3.5 w-3.5" />; })()} {cat}
                  </h2>
                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.filter((t) => t.category === cat).map((t) => {
                      const fav = favorites.has(t.slug);
                      return (
                        <div key={t.slug} className={`group relative min-w-0 rounded-2xl border p-5 transition hover:-translate-y-0.5 ${dark ? "border-[#1D396B] bg-[#0C1833] shadow-[0_12px_30px_rgba(0,8,30,0.25)] hover:border-[#3974E8] hover:shadow-[0_0_24px_rgba(10,79,232,0.16),0_14px_34px_rgba(0,8,30,0.34)]" : "border-[#E2E9F4] bg-white shadow-sm hover:border-[#0A4FE8]/30 hover:shadow-md"}`}>
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
                            <p className={`mt-1 line-clamp-2 text-[12.5px] leading-relaxed ${dark ? "text-slate-400" : "text-gray-500"}`}>{t.shortDescription}</p>
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
              {filtered.length === 0 && <p className={`mt-10 rounded-2xl border border-dashed py-16 text-center text-sm text-gray-400 ${dark ? "border-white/10 bg-[#0E1A35]" : "border-gray-200 bg-white"}`}>No tools match your search.</p>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function CreateAdvertBanner({ banner, dark }: { banner: AdvertBanner; dark: boolean }) {
  const content = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={banner.imageUrl || ""} alt={banner.altText || "CDS Space Create promotion"} className="h-full w-full object-cover" />
  );
  const className = `group relative block aspect-[16/5] w-full overflow-hidden rounded-2xl border transition hover:-translate-y-0.5 ${dark ? "border-[#28519A] bg-[#0C1833] shadow-[0_0_30px_rgba(10,79,232,0.14),0_18px_44px_rgba(0,8,30,0.36)] hover:border-[#4A7DE0] hover:shadow-[0_0_38px_rgba(10,79,232,0.22),0_20px_48px_rgba(0,8,30,0.42)]" : "border-[#DCE5F2] bg-white shadow-[0_12px_34px_rgba(20,45,90,0.08)] hover:border-blue-300 hover:shadow-[0_16px_40px_rgba(20,45,90,0.12)]"}`;

  return (
    <section className="mt-8" aria-label="Featured promotion">
      {banner.targetUrl
        ? banner.targetUrl.startsWith("/")
          ? <Link href={banner.targetUrl} className={className}>{content}</Link>
          : <a href={banner.targetUrl} target="_blank" rel="noopener noreferrer" className={className}>{content}</a>
        : <div className={className}>{content}</div>}
    </section>
  );
}

function RailItem({ icon: Icon, label, active, primary, pinned, dark, collapsed, onClick }: { icon: LucideIcon; label: string; active?: boolean; primary?: boolean; pinned?: boolean; dark?: boolean; collapsed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded-xl transition ${collapsed ? "h-11 w-11 justify-center self-center" : "h-11 w-full px-3"} ${primary ? dark ? "border border-[#5284FF]/50 bg-[#0A4FE8] text-white shadow-[0_0_24px_rgba(10,79,232,0.42)] hover:bg-[#135AF0] hover:shadow-[0_0_30px_rgba(10,79,232,0.56)]" : "bg-[#0A4FE8] text-white shadow-sm hover:bg-[#083EC0]" : pinned ? dark ? "border border-[#2B5BAF] bg-[#102447] text-blue-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_0_18px_rgba(10,79,232,0.1)] hover:border-[#477EE1] hover:bg-[#142B54]" : "border border-blue-100 bg-blue-50 text-[#0A4FE8] hover:border-blue-200 hover:bg-blue-100/70" : active ? dark ? "border border-[#294E90] bg-[#132342] text-white shadow-[0_0_18px_rgba(10,79,232,0.1)]" : "bg-blue-50 text-[#0A4FE8]" : dark ? "text-slate-400 hover:bg-white/[0.06] hover:text-white" : "text-gray-500 hover:bg-gray-100 hover:text-[#0D1B39]"}`}
    >
      <Icon className="h-[19px] w-[19px] shrink-0" />
      {!collapsed && <span className="truncate text-[13px] font-semibold">{label}</span>}
    </button>
  );
}

/* ---------- Creation card ---------- */
function CreationCard({ workspaceKind, c, compact = false, dark = false, onReload, selectable = false, selectMode = false, selected = false, onToggleSelect }: {
  c: Creation; compact?: boolean; onReload?: () => void;
  workspaceKind: Role;
  dark?: boolean;
  /** When true a checkbox is offered; card clicks toggle selection once anything is selected. */
  selectable?: boolean; selectMode?: boolean; selected?: boolean; onToggleSelect?: () => void;
}) {
  const src = outputImageSrc(c.output);
  const isReport = c.output?.kind === "report";
  // Show the encoded value / link so similar creations are distinguishable.
  const value = typeof c.output?.value === "string" ? c.output.value : "";
  const subtitle = value && value !== c.title ? value : c.toolName;
  async function act(action: "duplicate" | "delete") {
    await fetch(createApiPath("/api/create/creations", workspaceKind), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: c.id }) });
    onReload?.();
  }
  return (
    <div
      onClick={selectMode ? onToggleSelect : undefined}
      className={`group relative min-w-0 overflow-hidden rounded-2xl border transition hover:-translate-y-0.5 ${dark ? "bg-[#0C1833] shadow-[0_12px_30px_rgba(0,8,30,0.28)] hover:border-[#3974E8] hover:shadow-[0_0_24px_rgba(10,79,232,0.16),0_14px_34px_rgba(0,8,30,0.36)]" : "bg-white shadow-sm"} ${compact ? "w-full" : ""} ${selectMode ? "cursor-pointer" : ""} ${selected ? "border-[#0A4FE8] ring-2 ring-[#0A4FE8]/30" : dark ? "border-[#1D396B]" : "border-gray-100"}`}
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
      <div className={`grid aspect-square place-items-center p-3 ${dark ? "bg-[#07132B]" : "bg-[#F6F7FB]"}`}>
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
function CreationsView({ workspaceKind, data, dark, onBack, reload }: { workspaceKind: Role; data: DashData | null; dark: boolean; onBack: () => void; reload: () => void }) {
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
      await fetch(createApiPath("/api/create/creations", workspaceKind), {
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
          <h1 className="text-[26px] font-bold tracking-tight">My creations</h1>
          <p className={`mt-1 text-sm ${dark ? "text-slate-400" : "text-gray-500"}`}>{items.length} recent item{items.length === 1 ? "" : "s"}. Select items for bulk actions, or download, duplicate, and remove one at a time.</p>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => setSelected(allSelected ? [] : items.map((c) => c.id))}
            className={`rounded-xl border px-3 py-2 text-[12.5px] font-semibold ${dark ? "border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            {allSelected ? "Clear selection" : "Select all"}
          </button>
        )}
      </div>

      {selecting && (
        <div className={`sticky top-2 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border p-2.5 shadow-lg backdrop-blur ${dark ? "border-white/10 bg-[#0E1A35]/95" : "border-blue-100 bg-white/95"}`}>
          <span className={`px-1.5 text-[13px] font-bold ${dark ? "text-white" : "text-[#0D1B39]"}`}>{selected.length} selected</span>
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
        <p className={`mt-6 rounded-2xl border border-dashed py-16 text-center text-sm text-gray-400 ${dark ? "border-white/10 bg-[#0E1A35]" : "border-gray-200 bg-white"}`}>No creations yet. Run a tool to get started.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((c) => (
            <CreationCard
              workspaceKind={workspaceKind}
              key={c.id}
              c={c}
              dark={dark}
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

type CheckState = "available" | "used" | "uncertain";

function AvailabilityPill({ state }: { state: CheckState }) {
  const Icon = state === "available" ? CircleCheck : state === "used" ? CircleAlert : CircleHelp;
  const className = state === "available"
    ? "bg-emerald-50 text-emerald-700"
    : state === "used"
      ? "bg-rose-50 text-rose-700"
      : "bg-amber-50 text-amber-700";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${className}`}><Icon className="h-3 w-3" />{state}</span>;
}

function BrandNameReport({ output }: { output: Record<string, unknown> }) {
  const domains = Array.isArray(output.domains) ? output.domains as Array<Record<string, unknown>> : [];
  const social = Array.isArray(output.social) ? output.social as Array<Record<string, unknown>> : [];
  const companies = Array.isArray(output.companies) ? output.companies as Array<Record<string, unknown>> : [];
  const risks = Array.isArray(output.risks) ? output.risks.map(String) : [];
  const alternatives = Array.isArray(output.alternatives) ? output.alternatives.map(String) : [];
  const sources = Array.isArray(output.sources) ? output.sources as Array<Record<string, unknown>> : [];
  return (
    <div className="max-h-[560px] w-full space-y-4 overflow-y-auto p-1 text-left">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
        <p className="text-[13px] font-bold text-[#07133B]">{String(output.brandName || "Brand name")} availability review</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-gray-600">{String(output.summary || "Review the live signals below.")}</p>
      </div>
      <SignalSection title="Domains" icon={Globe2} rows={domains} primary="domain" />
      <SignalSection title="Social handles" icon={AtSign} rows={social} primary="platform" secondary="handle" />
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-[#07133B]"><Building2 className="h-4 w-4 text-[#0A4FE8]" />Company and commercial-name matches</h3>
        {companies.length ? <div className="space-y-2">{companies.map((item, index) => (
          <a key={`${String(item.name)}-${index}`} href={String(item.url || "#")} target="_blank" rel="noreferrer" className="block rounded-lg border border-gray-100 p-2.5 hover:border-blue-200">
            <div className="flex items-start justify-between gap-2"><div><p className="text-[11.5px] font-bold text-[#07133B]">{String(item.name)}</p><p className="text-[10.5px] text-gray-400">{String(item.jurisdiction || "Jurisdiction not confirmed")}</p></div><span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-semibold capitalize text-rose-700">{String(item.status || "match")}</span></div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-gray-500">{String(item.evidence || "Public commercial use found.")}</p>
          </a>
        ))}</div> : <p className="rounded-lg border border-gray-100 p-3 text-[11px] text-gray-500">No reliable public match was returned. This is not proof of legal availability.</p>}
      </div>
      {risks.length > 0 && <div><h3 className="mb-1.5 text-[12px] font-bold text-[#07133B]">Risk notes</h3><ul className="space-y-1 text-[11px] leading-relaxed text-gray-600">{risks.map((risk) => <li key={risk} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{risk}</li>)}</ul></div>}
      {alternatives.length > 0 && <div><h3 className="mb-1.5 text-[12px] font-bold text-[#07133B]">Suggested alternatives</h3><div className="flex flex-wrap gap-1.5">{alternatives.map((name) => <span key={name} className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-[#0A4FE8]">{name}</span>)}</div></div>}
      {sources.length > 0 && <details className="rounded-lg border border-gray-100 p-3"><summary className="cursor-pointer text-[11px] font-semibold text-gray-600">Research sources ({sources.length})</summary><div className="mt-2 space-y-1">{sources.map((source, index) => <a key={`${String(source.url)}-${index}`} href={String(source.url)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10.5px] text-[#0A4FE8] hover:underline">{String(source.title || source.url)}<ExternalLink className="h-3 w-3" /></a>)}</div></details>}
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[10.5px] leading-relaxed text-amber-800">{String(output.disclaimer || "This is a preliminary public-source search, not legal clearance or a guarantee of availability.")}</p>
    </div>
  );
}

function SignalSection({ title, icon: Icon, rows, primary, secondary }: { title: string; icon: LucideIcon; rows: Array<Record<string, unknown>>; primary: string; secondary?: string }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-[#07133B]"><Icon className="h-4 w-4 text-[#0A4FE8]" />{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2">{rows.map((item, index) => (
        <a key={`${String(item[primary])}-${index}`} href={String(item.url || "#")} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-100 p-2.5 hover:border-blue-200">
          <div className="flex items-center justify-between gap-2"><span className="truncate text-[11.5px] font-bold text-[#07133B]">{String(item[primary])}{secondary ? ` · ${String(item[secondary] || "")}` : ""}</span><AvailabilityPill state={(item.status === "available" || item.status === "used" ? item.status : "uncertain") as CheckState} /></div>
          <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-gray-400">{String(item.evidence || "No evidence supplied.")}</p>
        </a>
      ))}</div>
    </div>
  );
}

/* ---------- Full-page tool ---------- */
function ToolPage({ workspaceKind, tool, onBack, onSaved }: { workspaceKind: Role; tool: Tool; onBack: () => void; onSaved: () => void }) {
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
    const res = await fetch(createApiPath(`/api/create/tools/${tool.slug}/run`, workspaceKind), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
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
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} {running ? "Generating..." : `Generate${tool.creditCost ? ` (${tool.creditCost} credit${tool.creditCost === 1 ? "" : "s"})` : ""}`}
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
              ) : result.output.kind === "brand_name_report" ? <BrandNameReport output={result.output} />
              : src ? <img src={src} alt="Result" className="max-h-[420px] max-w-full object-contain" />
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
