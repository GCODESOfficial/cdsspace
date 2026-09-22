"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Upload } from "lucide-react";
import { appAlert } from "@/lib/app-notify";
import {
  animatedNotoStickerUrl,
  ESSENTIAL_CHAT_STICKERS,
  type ChatStickerSelection,
  type CustomChatSticker,
} from "@/lib/chat-stickers";
import { cn } from "@/lib/utils";

interface ChatStickerPickerProps {
  actor?: "client";
  dark?: boolean;
  onSelect: (sticker: ChatStickerSelection) => void | Promise<void>;
}

export function ChatStickerPicker({ actor, dark = false, onSelect }: ChatStickerPickerProps) {
  const [customStickers, setCustomStickers] = useState<CustomChatSticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [emoji, setEmoji] = useState("🙂");
  const [title, setTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const endpoint = `/api/chat/stickers${actor ? "?actor=client" : ""}`;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load stickers");
      setCustomStickers(payload.stickers || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createEmojiSticker() {
    if (!emoji.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/chat/stickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji: emoji.trim(), title: title.trim() || "Custom sticker", actor }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Sticker could not be created");
      setCustomStickers((current) => [payload.sticker, ...current]);
      setTitle("");
      setCreating(false);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Sticker could not be created");
    } finally {
      setSaving(false);
    }
  }

  async function uploadSticker(file: File) {
    if (saving) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("title", file.name.replace(/\.[^.]+$/, "") || "Custom sticker");
      if (actor) formData.set("actor", actor);
      const response = await fetch("/api/chat/stickers", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Sticker could not be uploaded");
      setCustomStickers((current) => [payload.sticker, ...current]);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Sticker could not be uploaded");
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="max-h-[44dvh] space-y-4 overflow-y-auto pr-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={cn("text-[13px] font-semibold", dark ? "text-white" : "text-slate-800")}>Stickers</p>
          <p className={cn("mt-0.5 text-[10px]", dark ? "text-slate-400" : "text-slate-500")}>Upload an image or a video up to 6 seconds. Videos are converted to looping GIF stickers.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/gif,image/webp,image/png,image/jpeg,video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-matroska"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadSticker(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-semibold transition disabled:opacity-50", dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700")}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {saving ? "Preparing..." : "Add sticker"}
          </button>
          <button type="button" onClick={() => setCreating((current) => !current)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0A4FE8] px-3 text-[11px] font-semibold text-white transition hover:bg-[#083EC0]">
            <Plus className="h-3.5 w-3.5" /> Create
          </button>
        </div>
      </div>

      {creating && (
        <div className={cn("grid gap-3 rounded-2xl border p-3 sm:grid-cols-[96px_1fr]", dark ? "border-slate-700 bg-slate-900/60" : "border-slate-200 bg-slate-50")}>
          <div className="grid h-24 w-24 place-items-center rounded-2xl bg-transparent text-[52px]">
            <span className="cds-sticker-motion cds-sticker-pop">{emoji || "🙂"}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-[90px_1fr_auto] sm:items-end">
            <label className="grid gap-1 text-[10px] text-slate-500">Emoji<input value={emoji} onChange={(event) => setEmoji(event.target.value.slice(0, 24))} className={cn("h-10 rounded-xl border px-3 text-xl outline-none", dark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900")} /></label>
            <label className="grid gap-1 text-[10px] text-slate-500">Sticker name<input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 40))} placeholder="Favourite" className={cn("h-10 rounded-xl border px-3 text-[12px] outline-none", dark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900")} /></label>
            <button type="button" onClick={() => void createEmojiSticker()} disabled={!emoji.trim() || saving} className="h-10 rounded-xl bg-[#0A4FE8] px-4 text-[11px] font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
          </div>
        </div>
      )}

      {(loading || customStickers.length > 0) && (
        <section>
          <p className={cn("mb-2 text-[11px] font-semibold", dark ? "text-slate-300" : "text-slate-600")}>Custom stickers</p>
          {loading ? (
            <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {customStickers.map((sticker) => (
                <button key={sticker.id} type="button" onClick={() => void onSelect({ stickerKey: `custom:${sticker.id}`, attachmentUrl: sticker.asset_url, mimeType: sticker.mime_type, metadata: { custom_sticker: sticker } })} className={cn("group/sticker rounded-2xl border border-transparent bg-transparent p-2 text-center transition hover:border-slate-200 hover:bg-slate-500/5", dark && "hover:border-slate-700")} title={sticker.title}>
                  {sticker.asset_url ? <img src={sticker.asset_url} alt={sticker.title} className="mx-auto h-14 w-14 object-contain" /> : <span className="cds-sticker-motion cds-sticker-pop block text-[40px] leading-[56px]">{sticker.emoji}</span>}
                  <span className={cn("mt-1 block truncate text-[9px] font-medium", dark ? "text-slate-300" : "text-slate-500")}>{sticker.title}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className={cn("text-[11px] font-semibold", dark ? "text-slate-300" : "text-slate-600")}>Animated essentials</p>
          <a href="https://googlefonts.github.io/noto-emoji-files/" target="_blank" rel="noreferrer" className="text-[9px] text-slate-400 underline underline-offset-2">Noto Animated Emoji · CC BY 4.0</a>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ESSENTIAL_CHAT_STICKERS.map((sticker) => (
            <button key={sticker.key} type="button" onClick={() => void onSelect({ stickerKey: sticker.key })} className={cn("rounded-2xl border border-transparent bg-transparent p-2 text-center transition hover:border-slate-200 hover:bg-slate-500/5", dark && "hover:border-slate-700")}>
              <img src={animatedNotoStickerUrl(sticker.notoCode)} alt={sticker.emoji} className={cn("cds-sticker-motion mx-auto h-14 w-14 object-contain", sticker.motion)} />
              <span className={cn("mt-1 block truncate text-[9px] font-medium", dark ? "text-slate-300" : "text-slate-500")}>{sticker.title}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
