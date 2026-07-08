"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Plus, X, Hash } from "lucide-react";
import { appAlert } from "@/lib/app-notify";
import ContentHubShell from "@/components/content-hub/ContentHubShell";
import { AssetUrlField } from "@/components/admin/AssetUrlField";
import { REMINDER_OFFSETS, REMINDER_CHANNELS } from "@/lib/content-hub/shared";

interface Publisher { id: string; full_name: string; role_title: string | null }
interface BestExample { text: string; platform?: string; note?: string }

const BRAND_FIELDS: { key: string; label: string; placeholder: string; asset?: "image" | "video" }[] = [
  { key: "logo_url", label: "Logo URL", placeholder: "https://.../logo.png", asset: "image" },
  { key: "watermark_url", label: "Watermark URL", placeholder: "https://.../watermark.png", asset: "image" },
  { key: "intro_url", label: "Intro clip URL", placeholder: "https://.../intro.mp4", asset: "video" },
  { key: "outro_url", label: "Outro clip URL", placeholder: "https://.../outro.mp4", asset: "video" },
  { key: "font", label: "Primary font", placeholder: "Inter" },
  { key: "primary_color", label: "Primary color", placeholder: "#0A4FE8" },
  { key: "secondary_color", label: "Secondary color", placeholder: "#040B37" },
];

export default function ContentSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [branding, setBranding] = useState<Record<string, string>>({});
  const [offsets, setOffsets] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [defaultPublisher, setDefaultPublisher] = useState("");
  const [defaultHashtags, setDefaultHashtags] = useState(3);
  const [bestExamples, setBestExamples] = useState<BestExample[]>([]);
  const [exText, setExText] = useState("");
  const [exPlatform, setExPlatform] = useState("");

  useEffect(() => {
    fetch("/api/admin/content-hub/meta", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setPublishers(d.publishers || []);
          setBranding((d.settings?.branding as Record<string, string>) || {});
          setOffsets(d.settings?.reminder_offsets || ["24h", "1h", "15m", "due"]);
          setChannels(d.settings?.reminder_channels || ["dashboard", "email"]);
          setDefaultPublisher(d.settings?.default_publisher_id || "");
          setDefaultHashtags(typeof d.settings?.default_hashtags === "number" ? d.settings.default_hashtags : 3);
          setBestExamples(Array.isArray(d.settings?.best_examples) ? d.settings.best_examples : []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  function addExample() {
    const text = exText.trim();
    if (!text) return;
    setBestExamples((prev) => [{ text, platform: exPlatform.trim() || undefined }, ...prev]);
    setExText("");
    setExPlatform("");
  }
  function removeExample(index: number) {
    setBestExamples((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/content-hub/meta", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branding, reminder_offsets: offsets, reminder_channels: channels, default_publisher_id: defaultPublisher || null, default_hashtags: defaultHashtags, best_examples: bestExamples }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed.");
      await appAlert({ title: "Saved", message: "Settings updated.", kind: "success" });
    } catch (e) { await appAlert({ title: "Settings", message: e instanceof Error ? e.message : "Failed.", kind: "error" }); }
    finally { setSaving(false); }
  }

  if (loading) return <ContentHubShell title="Settings"><div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div></ContentHubShell>;

  return (
    <ContentHubShell
      title="Settings"
      subtitle="Branding presets for BSD Studio and default reminder behaviour for scheduled content."
      action={<button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-[15px] font-bold text-[#0D1B39]">CDS Space branding presets</h2>
          <p className="text-[12px] text-gray-500">Auto-applied to repurposed clips (logo, watermark, intro/outro, fonts, colors).</p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {BRAND_FIELDS.map((f) =>
              f.asset ? (
                <AssetUrlField
                  key={f.key}
                  label={f.label}
                  value={branding[f.key] || ""}
                  onChange={(url) => setBranding({ ...branding, [f.key]: url })}
                  placeholder={f.placeholder}
                  accept={f.asset}
                  folder="branding"
                />
              ) : (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-[12px] font-semibold text-[#0D1B39]">{f.label}</span>
                  <input value={branding[f.key] || ""} onChange={(e) => setBranding({ ...branding, [f.key]: e.target.value })} placeholder={f.placeholder} className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
                </label>
              )
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-[15px] font-bold text-[#0D1B39]">Reminder defaults</h2>
          <p className="text-[12px] text-gray-500">Pre-selected when scheduling content in the wizard.</p>

          <p className="mt-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">When to remind</p>
          <div className="flex flex-wrap gap-2">
            {REMINDER_OFFSETS.map((o) => (
              <button key={o.value} onClick={() => setOffsets(toggle(offsets, o.value))} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${offsets.includes(o.value) ? "bg-[#0A4FE8] text-white" : "bg-gray-100 text-gray-600 hover:bg-blue-50"}`}>{o.label}</button>
            ))}
          </div>

          <p className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Channels</p>
          <div className="flex flex-wrap gap-2">
            {REMINDER_CHANNELS.map((c) => (
              <button key={c.value} onClick={() => setChannels(toggle(channels, c.value))} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${channels.includes(c.value) ? "bg-[#0A4FE8] text-white" : "bg-gray-100 text-gray-600 hover:bg-blue-50"}`}>{c.label}</button>
            ))}
          </div>

          <p className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Default publisher</p>
          <select value={defaultPublisher} onChange={(e) => setDefaultPublisher(e.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] font-medium">
            <option value="">None</option>
            {publishers.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.role_title ? ` · ${p.role_title}` : ""}</option>)}
          </select>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-[15px] font-bold text-[#0D1B39]">AI writing</h2>
        <p className="text-[12px] text-gray-500">Defaults the AI Assistant uses when generating captions, hashtags and repurposed posts.</p>

        <div className="mt-4 flex flex-wrap items-end gap-6">
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#0D1B39]"><Hash className="h-3.5 w-3.5 text-[#0A4FE8]" /> Default number of hashtags</span>
            <input
              type="number"
              min={0}
              max={30}
              value={defaultHashtags}
              onChange={(e) => setDefaultHashtags(Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)))}
              className="h-10 w-28 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] font-medium outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <p className="pb-2 text-[11px] text-gray-400">The AI generates this many hashtags by default (default 3).</p>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Best-performing content</p>
          <p className="mt-0.5 text-[12px] text-gray-500">Paste your top posts. The AI studies their hooks, structure, rhythm and voice so it writes more content like them.</p>

          <div className="mt-3 grid gap-2">
            <textarea
              value={exText}
              onChange={(e) => setExText(e.target.value)}
              placeholder="Paste a high-performing caption or post here..."
              className="min-h-[92px] w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12.5px] outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={exPlatform}
                onChange={(e) => setExPlatform(e.target.value)}
                placeholder="Platform (optional, e.g. LinkedIn)"
                className="h-10 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={addExample}
                disabled={!exText.trim()}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#0A4FE8] px-4 text-[12.5px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Add example
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {bestExamples.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-[12px] text-gray-400">No examples yet. Add your best posts so the AI can learn from them.</p>
            ) : (
              bestExamples.map((ex, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#0D1B39]">{ex.text}</p>
                    <button onClick={() => removeExample(i)} className="shrink-0 rounded-full p-1 text-gray-400 transition hover:bg-gray-200 hover:text-rose-500" aria-label="Remove example">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {ex.platform && <span className="mt-1.5 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500">{ex.platform}</span>}
                </div>
              ))
            )}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">Remember to press Save. Up to 50 examples are kept; the AI uses your most recent ones.</p>
        </div>
      </section>
    </ContentHubShell>
  );
}
