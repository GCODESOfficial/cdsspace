"use client";

import { useState } from "react";
import { Sparkles, Loader2, Copy, Check, Plus, Hash } from "lucide-react";
import { appAlert } from "@/lib/app-notify";
import ContentHubShell from "@/components/content-hub/ContentHubShell";
import { TONES, PLATFORMS, ENHANCE_ACTIONS } from "@/lib/content-hub/shared";

export default function AiAssistantPage() {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [platform, setPlatform] = useState("");
  const [tone, setTone] = useState("cdsspace");
  const [objective, setObjective] = useState("");
  const [output, setOutput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function ai(action: string, payload: Record<string, unknown>) {
    setBusy(action);
    try {
      const res = await fetch("/api/admin/content-hub/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "AI failed.");
      return json.result;
    } catch (e) { await appAlert({ title: "AI", message: e instanceof Error ? e.message : "AI failed.", kind: "error" }); return null; }
    finally { setBusy(null); }
  }

  async function generate() {
    if (!topic.trim()) return appAlert({ title: "Topic", message: "Enter a topic or idea.", kind: "error" });
    const text = await ai("generate", { topic, audience, platform, tone, objective });
    if (text) setOutput(text);
  }
  async function enhance(kind: string) { const t = await ai("enhance", { kind, content: output }); if (t) setOutput(t); }
  async function genHashtags() { const t = await ai("hashtags", { content: output }); if (Array.isArray(t)) setHashtags(t); }

  async function saveDraft() {
    const res = await fetch("/api/admin/content-hub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: topic.slice(0, 80) || "AI draft", body: output, source: "ai", status: "draft", hashtags, platforms: platform ? [platform] : [] }) });
    if ((await res.json()).ok) await appAlert({ title: "Saved", message: "Saved to library as a draft.", kind: "success" });
  }

  return (
    <ContentHubShell title="AI Assistant" subtitle="Brainstorm, draft and polish content fast. Send anything you like straight to the library.">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-[15px] font-bold text-[#0D1B39]">Brief</h2>
          <div className="mt-3 space-y-2.5">
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic or idea" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13.5px] outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
            <div className="grid grid-cols-2 gap-2.5">
              <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Audience" className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13.5px]" />
              <input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Objective" className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13.5px]" />
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] font-medium">
                <option value="">Any platform</option>
                {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] font-medium">
                {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <button onClick={generate} disabled={busy === "generate"} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-[13.5px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-60">
              {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-[#0D1B39]">Output</h2>
            {output && (
              <div className="flex gap-2">
                <button onClick={async () => { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11.5px] font-semibold text-gray-600 hover:bg-gray-50">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</button>
                <button onClick={saveDraft} className="inline-flex items-center gap-1 rounded-lg bg-[#0A4FE8] px-2.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[#083EC0]"><Plus className="h-3.5 w-3.5" /> Save</button>
              </div>
            )}
          </div>
          <textarea value={output} onChange={(e) => setOutput(e.target.value)} rows={10} placeholder="Generated content appears here - edit freely." className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] leading-6 text-[#0D1B39] outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
          {output && (
            <div className="mt-3 flex flex-wrap gap-2">
              {ENHANCE_ACTIONS.map((a) => (
                <button key={a.value} disabled={!!busy} onClick={() => enhance(a.value)} className="rounded-full border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-[12px] font-semibold text-[#0A4FE8] hover:bg-blue-100 disabled:opacity-50">{a.label}</button>
              ))}
              <button disabled={!!busy} onClick={genHashtags} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-[12px] font-semibold text-[#0A4FE8] hover:bg-blue-100 disabled:opacity-50"><Hash className="h-3.5 w-3.5" /> Hashtags</button>
            </div>
          )}
          {hashtags.length > 0 && <p className="mt-3 rounded-xl bg-gray-50 p-3 text-[12px] font-medium text-[#0A4FE8]">{hashtags.join(" ")}</p>}
        </section>
      </div>
    </ContentHubShell>
  );
}
