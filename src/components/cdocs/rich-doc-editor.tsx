"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appPrompt } from "@/lib/app-notify";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2, Heading3, Minus, Link as LinkIcon,
  Image as ImageIcon, Palette, Type, Undo2, Redo2, Quote, Code, RemoveFormatting,
} from "lucide-react";

/**
 * CDS Space branded rich editor.
 *
 * Thin wrapper around contentEditable + document.execCommand (still the
 * simplest cross-browser way to build a WYSIWYG). Emits HTML via `onChange`.
 * Image uploads render inline with draggable corner handles for resize.
 */

const COLORS = [
  "#0A4FE8", "#040B37", "#0D1B39", "#4B5563", "#6B7280", "#9CA3AF",
  "#DC2626", "#EA580C", "#D97706", "#16A34A", "#0891B2", "#7C3AED",
  "#DB2777", "#000000", "#FFFFFF",
];

const FONT_SIZES = [
  { label: "Tiny", value: "1" },   // ≈ 10px
  { label: "Small", value: "2" },  // ≈ 13px
  { label: "Normal", value: "3" }, // ≈ 16px
  { label: "Large", value: "5" },  // ≈ 24px
  { label: "Huge", value: "6" },   // ≈ 32px
];

export interface RichDocEditorProps {
  value: string;
  onChange: (html: string) => void;
  theme?: "light" | "dark";
  placeholder?: string;
}

export function RichDocEditor({ value, onChange, theme = "light", placeholder = "Start writing…" }: RichDocEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [savedSelection, setSavedSelection] = useState<Range | null>(null);

  // Paint initial value once; after that contentEditable owns it
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (el.innerHTML !== value) el.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the DOM in sync when the external value changes from OUT of the
  // component (e.g. after initial fetch). We only paint when they differ.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!document.activeElement || !el.contains(document.activeElement)) {
      if (el.innerHTML !== (value || "")) el.innerHTML = value || "";
    }
  }, [value]);

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) setSavedSelection(sel.getRangeAt(0).cloneRange());
  }
  function restoreSelection() {
    if (!savedSelection) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedSelection);
  }

  function exec(cmd: string, val?: string) {
    rootRef.current?.focus();
    restoreSelection();
    document.execCommand(cmd, false, val);
    emit();
  }

  function emit() {
    if (rootRef.current) onChange(rootRef.current.innerHTML);
  }

  /* ---------------- Image insertion ---------------- */
  function pickImage() {
    fileInputRef.current?.click();
  }
  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      insertImage(url, f.name);
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  }
  function insertImage(src: string, alt = "") {
    rootRef.current?.focus();
    restoreSelection();
    const html = `<img src="${src}" alt="${escapeAttr(alt)}" style="max-width: 100%; display: inline-block;" />`;
    document.execCommand("insertHTML", false, html);
    emit();
  }

  /* ---------------- Link ---------------- */
  async function addLink() {
    rootRef.current?.focus();
    restoreSelection();
    const current = window.getSelection()?.toString() || "";
    const url = await appPrompt({ title: "Insert link", message: "Link URL", defaultValue: "https://", inputType: "url" });
    if (!url) return;
    if (current) {
      exec("createLink", url);
    } else {
      exec("insertHTML", `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeAttr(url)}</a>`);
    }
  }

  /* ---------------- Image resize handles ---------------- */
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "IMG") setSelectedImage(t as HTMLImageElement);
      else setSelectedImage(null);
    }
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  const resizeRef = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null);
  function beginResize(e: React.PointerEvent, corner: "se" | "sw" | "ne" | "nw") {
    if (!selectedImage) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = selectedImage.getBoundingClientRect();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, w: rect.width, h: rect.height };
    function onMove(ev: PointerEvent) {
      const r = resizeRef.current; if (!r || !selectedImage) return;
      const dx = ev.clientX - r.startX;
      const aspect = r.h / r.w;
      const newW = Math.max(60, r.w + (corner.endsWith("e") ? dx : -dx));
      const newH = Math.round(newW * aspect);
      selectedImage.style.width = `${newW}px`;
      selectedImage.style.height = `${newH}px`;
      selectedImage.setAttribute("width", String(Math.round(newW)));
      selectedImage.setAttribute("height", String(newH));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      resizeRef.current = null;
      emit();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function setImageAlign(align: "left" | "center" | "right") {
    if (!selectedImage) return;
    selectedImage.setAttribute("data-align", align);
    selectedImage.style.display = align === "center" ? "block" : "inline-block";
    if (align === "center") {
      selectedImage.style.marginLeft = "auto";
      selectedImage.style.marginRight = "auto";
      selectedImage.style.float = "none";
    } else if (align === "left") {
      selectedImage.style.float = "left";
      selectedImage.style.marginRight = "12px";
      selectedImage.style.marginLeft = "0";
    } else {
      selectedImage.style.float = "right";
      selectedImage.style.marginLeft = "12px";
      selectedImage.style.marginRight = "0";
    }
    emit();
  }

  function removeSelectedImage() {
    if (!selectedImage) return;
    selectedImage.remove();
    setSelectedImage(null);
    emit();
  }

  const isDark = theme === "dark";

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div
        onMouseDown={(e) => { saveSelection(); e.preventDefault(); /* keep selection while clicking buttons */ }}
        className={`sticky top-[56px] z-20 flex flex-wrap items-center gap-0.5 overflow-visible px-2 py-2 rounded-xl border mb-4 ${
          isDark ? "bg-[#10225A] border-white/10" : "bg-white border-gray-100 shadow-sm"
        }`}
      >
        {/* History */}
        <TBtn icon={<Undo2 className="w-3.5 h-3.5" />} title="Undo" onClick={() => exec("undo")} dark={isDark} />
        <TBtn icon={<Redo2 className="w-3.5 h-3.5" />} title="Redo" onClick={() => exec("redo")} dark={isDark} />
        <Divider dark={isDark} />

        {/* Block style */}
        <TBtn icon={<Heading1 className="w-3.5 h-3.5" />} title="Heading 1" onClick={() => exec("formatBlock", "H1")} dark={isDark} />
        <TBtn icon={<Heading2 className="w-3.5 h-3.5" />} title="Heading 2" onClick={() => exec("formatBlock", "H2")} dark={isDark} />
        <TBtn icon={<Heading3 className="w-3.5 h-3.5" />} title="Heading 3" onClick={() => exec("formatBlock", "H3")} dark={isDark} />
        <TBtn icon={<Type className="w-3.5 h-3.5" />} title="Paragraph" onClick={() => exec("formatBlock", "P")} dark={isDark} />
        <Divider dark={isDark} />

        {/* Inline */}
        <TBtn icon={<Bold className="w-3.5 h-3.5" />} title="Bold (⌘B)" onClick={() => exec("bold")} dark={isDark} />
        <TBtn icon={<Italic className="w-3.5 h-3.5" />} title="Italic (⌘I)" onClick={() => exec("italic")} dark={isDark} />
        <TBtn icon={<Underline className="w-3.5 h-3.5" />} title="Underline (⌘U)" onClick={() => exec("underline")} dark={isDark} />
        <TBtn icon={<RemoveFormatting className="w-3.5 h-3.5" />} title="Clear formatting" onClick={() => exec("removeFormat")} dark={isDark} />
        <Divider dark={isDark} />

        {/* Color */}
        <div className="relative shrink-0">
          <TBtn icon={<Palette className="w-3.5 h-3.5" />} title="Text color" onClick={() => setColorOpen((v) => !v)} dark={isDark} />
          {colorOpen && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              className="absolute z-30 top-full left-0 mt-1 bg-white rounded-xl shadow-xl ring-1 ring-gray-100 p-2 grid grid-cols-5 gap-1"
            >
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { exec("foreColor", c); setColorOpen(false); }}
                  className="w-6 h-6 rounded-md border border-gray-100"
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
          )}
        </div>

        {/* Font size */}
        <div className="relative shrink-0">
          <TBtn icon={<span className="text-[10px] font-bold">AA</span>} title="Font size" onClick={() => setFontSizeOpen((v) => !v)} dark={isDark} />
          {fontSizeOpen && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              className="layer-popover absolute left-0 top-full mt-1 flex w-36 min-w-36 shrink-0 flex-col overflow-hidden rounded-xl bg-white p-1 shadow-xl ring-1 ring-gray-100"
            >
              {FONT_SIZES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => { exec("fontSize", s.value); setFontSizeOpen(false); }}
                  className="block w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-[12.5px] leading-5 text-[#07133B] hover:bg-gray-50"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Divider dark={isDark} />

        {/* Alignment */}
        <TBtn icon={<AlignLeft className="w-3.5 h-3.5" />} title="Align left" onClick={() => exec("justifyLeft")} dark={isDark} />
        <TBtn icon={<AlignCenter className="w-3.5 h-3.5" />} title="Align center" onClick={() => exec("justifyCenter")} dark={isDark} />
        <TBtn icon={<AlignRight className="w-3.5 h-3.5" />} title="Align right" onClick={() => exec("justifyRight")} dark={isDark} />
        <TBtn icon={<AlignJustify className="w-3.5 h-3.5" />} title="Justify" onClick={() => exec("justifyFull")} dark={isDark} />
        <Divider dark={isDark} />

        {/* Lists */}
        <TBtn icon={<List className="w-3.5 h-3.5" />} title="Bulleted list" onClick={() => exec("insertUnorderedList")} dark={isDark} />
        <TBtn icon={<ListOrdered className="w-3.5 h-3.5" />} title="Numbered list" onClick={() => exec("insertOrderedList")} dark={isDark} />
        <TBtn icon={<Quote className="w-3.5 h-3.5" />} title="Quote" onClick={() => exec("formatBlock", "BLOCKQUOTE")} dark={isDark} />
        <TBtn icon={<Code className="w-3.5 h-3.5" />} title="Inline code" onClick={() => exec("formatBlock", "PRE")} dark={isDark} />
        <Divider dark={isDark} />

        {/* Insert */}
        <TBtn icon={<LinkIcon className="w-3.5 h-3.5" />} title="Insert link" onClick={addLink} dark={isDark} />
        <TBtn icon={<ImageIcon className="w-3.5 h-3.5" />} title="Insert image" onClick={pickImage} dark={isDark} />
        <TBtn icon={<Minus className="w-3.5 h-3.5" />} title="Divider" onClick={() => exec("insertHorizontalRule")} dark={isDark} />

        <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileSelected} className="hidden" />
      </div>

      {/* Image-selected floating actions */}
      {selectedImage && (
        <div className="mb-3 inline-flex items-center gap-1 rounded-xl bg-white border border-gray-100 shadow-sm px-2 py-1.5 text-[11.5px]">
          <span className="px-1 text-gray-400">Image</span>
          <button onClick={() => setImageAlign("left")} className="p-1.5 rounded hover:bg-gray-50"><AlignLeft className="w-3.5 h-3.5 text-gray-500" /></button>
          <button onClick={() => setImageAlign("center")} className="p-1.5 rounded hover:bg-gray-50"><AlignCenter className="w-3.5 h-3.5 text-gray-500" /></button>
          <button onClick={() => setImageAlign("right")} className="p-1.5 rounded hover:bg-gray-50"><AlignRight className="w-3.5 h-3.5 text-gray-500" /></button>
          <div className="w-px h-4 bg-gray-100 mx-1" />
          <button onClick={removeSelectedImage} className="px-2 py-1 rounded text-rose-600 hover:bg-rose-50">Remove</button>
        </div>
      )}

      {/* Editable surface */}
      <div className="relative">
        <div
          ref={rootRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={saveSelection}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          data-placeholder={placeholder}
          className={`cdocs-editor min-h-[60vh] rounded-xl focus:outline-none ${
            isDark ? "text-white/90" : "text-[#0D1B39]"
          } leading-[1.7] text-[14.5px] prose-like`}
          style={{ wordBreak: "break-word" }}
        />

        {/* Resize handles overlaid on the selected image */}
        {selectedImage && <ResizeHandles img={selectedImage} onBeginResize={beginResize} />}
      </div>

      <style jsx>{`
        .cdocs-editor :global(h1) { font-size: 1.8rem; font-weight: 700; margin: 1rem 0 0.5rem; }
        .cdocs-editor :global(h2) { font-size: 1.4rem; font-weight: 700; margin: 0.9rem 0 0.4rem; }
        .cdocs-editor :global(h3) { font-size: 1.15rem; font-weight: 600; margin: 0.8rem 0 0.3rem; }
        .cdocs-editor :global(p) { margin: 0.35rem 0; }
        .cdocs-editor :global(ul), .cdocs-editor :global(ol) { padding-left: 1.4rem; margin: 0.5rem 0; }
        .cdocs-editor :global(li) { margin: 0.2rem 0; }
        .cdocs-editor :global(a) { color: #0A4FE8; text-decoration: underline; }
        .cdocs-editor :global(blockquote) { border-left: 3px solid #0A4FE8; padding-left: 0.9rem; margin: 0.6rem 0; color: #4B5563; }
        .cdocs-editor :global(pre) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #F3F4F8; padding: 0.5rem 0.7rem; border-radius: 8px; font-size: 0.85rem; }
        .cdocs-editor :global(hr) { border: 0; border-top: 1px solid #E5E7EB; margin: 1rem 0; }
        .cdocs-editor :global(img) { max-width: 100%; border-radius: 6px; cursor: pointer; }
        .cdocs-editor:empty::before {
          content: attr(data-placeholder);
          color: #9CA3AF;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

function TBtn({ icon, onClick, title, dark }: { icon: React.ReactNode; onClick: () => void; title: string; dark: boolean }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`w-8 h-8 flex items-center justify-center rounded-md transition ${
        dark ? "text-white/80 hover:bg-white/10" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {icon}
    </button>
  );
}

function Divider({ dark }: { dark: boolean }) {
  return <div className={`w-px h-5 mx-0.5 ${dark ? "bg-white/10" : "bg-gray-200"}`} />;
}

function ResizeHandles({ img, onBeginResize }: { img: HTMLImageElement; onBeginResize: (e: React.PointerEvent, c: "se" | "sw" | "ne" | "nw") => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [scrollKey, setScrollKey] = useState(0);

  useEffect(() => {
    function update() { setRect(img.getBoundingClientRect()); setScrollKey((k) => k + 1); }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(img);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [img]);

  if (!rect) return null;
  const handle = (corner: "se" | "sw" | "ne" | "nw", x: number, y: number, cursor: string) => (
    <div
      key={corner + scrollKey}
      onPointerDown={(e) => onBeginResize(e, corner)}
      style={{
        position: "fixed", left: x - 6, top: y - 6,
        width: 12, height: 12,
        background: "#0A4FE8", borderRadius: 3,
        border: "2px solid white",
        cursor, zIndex: 40,
      }}
    />
  );
  return (
    <>
      <div style={{ position: "fixed", left: rect.left - 1, top: rect.top - 1, width: rect.width + 2, height: rect.height + 2, border: "2px solid #0A4FE8", borderRadius: 6, pointerEvents: "none", zIndex: 35 }} />
      {handle("nw", rect.left, rect.top, "nwse-resize")}
      {handle("ne", rect.right, rect.top, "nesw-resize")}
      {handle("sw", rect.left, rect.bottom, "nesw-resize")}
      {handle("se", rect.right, rect.bottom, "nwse-resize")}
    </>
  );
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
