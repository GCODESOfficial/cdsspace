"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BrainCircuit, Check, Loader2, Plus, Save, ShieldCheck, Trash2, Zap } from "lucide-react";

type EngineKey = "internal" | "openai" | "magnific" | "creattie";
interface EngineState {
  key: EngineKey; label: string; enabled: boolean; configured: boolean;
  dailyBudgetCents: number; spentTodayCents: number; costPerCallCents: number;
  licenseAttested: boolean; config: Record<string, unknown>;
}
interface Route { toolSlug: string; capability: string; primaryEngine: string; fallbackEngines: string[]; }
interface Training { id: string; engine: string; capability: string; label: string | null; prompt: string | null; source: string; tags: string[]; status: string; createdAt: string; }

const ALL_ENGINES: EngineKey[] = ["internal", "openai", "magnific", "creattie"];
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function EnginesPage() {
  const [loading, setLoading] = useState(true);
  const [engines, setEngines] = useState<EngineState[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [training, setTraining] = useState<Training[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [form, setForm] = useState({ capability: "illustration", label: "", prompt: "", tags: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/create/engines", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (json.ok) { setEngines(json.engines || []); setRoutes(json.routes || []); setTraining(json.training || []); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>, tag: string) {
    setSaving(tag);
    await fetch("/api/admin/create/engines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await load();
    setSaving(null);
  }

  const patchEngine = (key: EngineKey, patch: Partial<EngineState>) =>
    setEngines((es) => es.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  if (loading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <Link href="/admin/create" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-[#0A4FE8]"><ArrowLeft className="h-4 w-4" /> CREATE Management</Link>
      <div className="mb-1 flex items-center gap-2.5">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><BrainCircuit className="h-6 w-6" /></span>
        <div>
          <h1 className="text-[26px] font-black tracking-tight">AI Engines</h1>
          <p className="text-[13px] text-gray-500">The four brains powering CREATE. Route tools, cap spend, and train the Internal brain.</p>
        </div>
      </div>

      {/* Engine cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {engines.map((e) => (
          <div key={e.key} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[15px] font-black">{e.label}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${e.configured ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{e.configured ? "Configured" : "No credentials"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${e.enabled ? "bg-blue-50 text-[#0A4FE8]" : "bg-gray-100 text-gray-400"}`}>{e.enabled ? "Enabled" : "Off"}</span>
                  {e.key === "creattie" && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${e.licenseAttested ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{e.licenseAttested ? "Licensed" : "License needed"}</span>}
                </div>
              </div>
              <button onClick={() => patchEngine(e.key, { enabled: !e.enabled })} className={`relative h-6 w-11 rounded-full transition ${e.enabled ? "bg-[#0A4FE8]" : "bg-gray-300"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${e.enabled ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
              <label className="font-semibold text-gray-500">Daily cap
                <div className="mt-1 flex items-center gap-1"><span className="text-gray-400">$</span>
                  <input type="number" min={0} step={0.5} value={(e.dailyBudgetCents / 100).toString()} onChange={(ev) => patchEngine(e.key, { dailyBudgetCents: Math.round(parseFloat(ev.target.value || "0") * 100) })} className="h-9 w-full rounded-lg border border-gray-200 px-2" disabled={e.key === "internal"} />
                </div>
                <span className="text-[10px] text-gray-400">{e.dailyBudgetCents === 0 ? "Uncapped" : `Spent ${money(e.spentTodayCents)} today`}</span>
              </label>
              <label className="font-semibold text-gray-500">Cost / call
                <div className="mt-1 flex items-center gap-1"><span className="text-gray-400">¢</span>
                  <input type="number" min={0} value={e.costPerCallCents} onChange={(ev) => patchEngine(e.key, { costPerCallCents: Math.max(0, parseInt(ev.target.value || "0", 10)) })} className="h-9 w-full rounded-lg border border-gray-200 px-2" disabled={e.key === "internal"} />
                </div>
                <span className="text-[10px] text-gray-400">estimate for budgeting</span>
              </label>
            </div>

            {e.key === "creattie" && (
              <label className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-[11.5px] text-amber-800">
                <input type="checkbox" checked={e.licenseAttested} onChange={(ev) => patchEngine(e.key, { licenseAttested: ev.target.checked })} className="mt-0.5" />
                <span>I confirm our Creattie plan licenses redistributing its assets through CDS Space CREATE. Required before this brain will serve assets.</span>
              </label>
            )}

            <button onClick={() => post({ action: "update_engine", key: e.key, enabled: e.enabled, dailyBudgetCents: e.dailyBudgetCents, costPerCallCents: e.costPerCallCents, licenseAttested: e.licenseAttested }, `eng-${e.key}`)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#083EC0]">
              {saving === `eng-${e.key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
            </button>
          </div>
        ))}
      </div>

      {/* Routing */}
      <h2 className="mt-9 flex items-center gap-2 text-[15px] font-black"><Zap className="h-4 w-4 text-[#0A4FE8]" /> Tool routing</h2>
      <p className="text-[12.5px] text-gray-500">Which brain runs each tool, with fallbacks tried in order. Internal is always the final fallback.</p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-[12.5px]">
          <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase text-gray-400">
            <tr><th className="px-4 py-2.5">Tool</th><th className="px-4 py-2.5">Primary brain</th><th className="px-4 py-2.5">Fallbacks</th><th className="px-4 py-2.5" /></tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.toolSlug} className="border-t border-gray-100">
                <td className="px-4 py-2.5 font-semibold">{r.toolSlug}</td>
                <td className="px-4 py-2.5">
                  <select value={r.primaryEngine} onChange={(e) => setRoutes((rs) => rs.map((x) => x.toolSlug === r.toolSlug ? { ...x, primaryEngine: e.target.value } : x))} className="h-9 rounded-lg border border-gray-200 px-2">
                    {ALL_ENGINES.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_ENGINES.filter((k) => k !== r.primaryEngine).map((k) => {
                      const on = r.fallbackEngines.includes(k);
                      return <button key={k} onClick={() => setRoutes((rs) => rs.map((x) => x.toolSlug === r.toolSlug ? { ...x, fallbackEngines: on ? x.fallbackEngines.filter((f) => f !== k) : [...x.fallbackEngines, k] } : x))}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-[#0A4FE8] text-white" : "bg-gray-100 text-gray-500"}`}>{k}</button>;
                    })}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <button onClick={() => post({ action: "update_route", toolSlug: r.toolSlug, primaryEngine: r.primaryEngine, fallbackEngines: r.fallbackEngines }, `route-${r.toolSlug}`)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-bold text-gray-600 hover:bg-blue-50">
                    {saving === `route-${r.toolSlug}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Training the Internal brain */}
      <h2 className="mt-9 flex items-center gap-2 text-[15px] font-black"><ShieldCheck className="h-4 w-4 text-[#0A4FE8]" /> Train the Internal brain</h2>
      <p className="text-[12.5px] text-gray-500">Curate first-party samples per capability. The Internal brain learns from these so the paid brains are called less over time.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <label className="text-[11px] font-bold uppercase text-gray-400">Capability
          <input value={form.capability} onChange={(e) => setForm({ ...form, capability: e.target.value })} className="mt-1 block h-9 w-40 rounded-lg border border-gray-200 px-2 text-[13px] font-normal normal-case text-gray-800" placeholder="illustration" />
        </label>
        <label className="text-[11px] font-bold uppercase text-gray-400">Label
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="mt-1 block h-9 w-44 rounded-lg border border-gray-200 px-2 text-[13px] font-normal normal-case text-gray-800" placeholder="Brand flat style" />
        </label>
        <label className="flex-1 text-[11px] font-bold uppercase text-gray-400">Prompt / notes
          <input value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} className="mt-1 block h-9 w-full min-w-[180px] rounded-lg border border-gray-200 px-2 text-[13px] font-normal normal-case text-gray-800" placeholder="What good output looks like" />
        </label>
        <label className="text-[11px] font-bold uppercase text-gray-400">Tags
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="mt-1 block h-9 w-36 rounded-lg border border-gray-200 px-2 text-[13px] font-normal normal-case text-gray-800" placeholder="flat, corporate" />
        </label>
        <button onClick={async () => { await post({ action: "add_training", capability: form.capability, label: form.label, prompt: form.prompt, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) }, "add-train"); setForm({ ...form, label: "", prompt: "", tags: "" }); }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3 text-[12px] font-bold text-white hover:bg-[#083EC0]">
          {saving === "add-train" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add sample
        </button>
      </div>
      {training.length > 0 && (
        <div className="mt-3 grid gap-2">
          {training.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-[12.5px] shadow-sm">
              <div className="min-w-0">
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#0A4FE8]">{t.capability}</span>
                <span className="ml-2 font-semibold">{t.label || "(untitled)"}</span>
                {t.prompt && <span className="ml-2 truncate text-gray-400">{t.prompt}</span>}
              </div>
              <button onClick={() => post({ action: "delete_training", id: t.id }, `del-${t.id}`)} className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
