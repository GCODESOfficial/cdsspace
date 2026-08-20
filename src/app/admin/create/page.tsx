"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Boxes, BrainCircuit, Check, Images, Loader2, Pencil, Wand2, X, Zap } from "lucide-react";

type Role = "client" | "team" | "admin";
interface Tool {
  id?: string; slug: string; name: string; shortDescription: string; category: string;
  stage: string; status: "active" | "maintenance" | "disabled"; roleAccess: Role[]; creditCost: number;
  requiresProvider: boolean; providerKey: string | null; isBeta: boolean; isNew: boolean; isFeatured: boolean;
  supportsSimpleMode: boolean; supportsProMode: boolean; outputFormats: string[];
}
interface AdminData {
  tools: Tool[];
  stats: Record<string, number> | null;
  topTools: { tool_slug: string; runs: number; credits: number }[];
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  maintenance: "bg-amber-50 text-amber-700",
  disabled: "bg-gray-100 text-gray-500",
};

function fmtBytes(bytes: number) {
  if (!bytes || bytes < 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"]; let v = bytes, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

export default function AdminCreatePage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tool | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/create", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setData(json.data);
    else setNotice({ tone: "error", text: json.error || "Could not load CREATE data." });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function saveTool(tool: Tool) {
    setSaving(true); setNotice(null);
    const res = await fetch("/api/admin/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tool) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setNotice({ tone: "error", text: json.error || "Could not save." }); return; }
    setNotice({ tone: "ok", text: `${tool.name} saved.` });
    setEditing(null);
    await load();
  }

  async function quickStatus(tool: Tool, status: Tool["status"]) {
    await saveTool({ ...tool, status });
  }

  const stats = data?.stats;

  return (
    <main className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#0A4FE8]"><Wand2 className="h-3.5 w-3.5" /> CREATE Management</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#07133B]">Creative tools platform</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-500">Manage CREATE tools, availability, credit cost, and role access. Changes reflect on create.cdsspace.pro immediately.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <a href="/admin/create/engines" className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#083EC0]"><BrainCircuit className="h-4 w-4" /> AI Engines</a>
          <a href="/create" className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-[13px] font-bold text-[#0A4FE8] hover:bg-blue-100"><Wand2 className="h-4 w-4" /> Open CREATE</a>
        </div>
      </header>

      {notice && <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{notice.text}</div>}

      {loading ? (
        <div className="grid min-h-52 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>
      ) : (
        <>
          {/* Stats */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: "Tools", value: stats?.tools ?? 0, icon: Boxes },
              { label: "Creations", value: stats?.creations ?? 0, icon: Images },
              { label: "Generations", value: stats?.events ?? 0, icon: Zap },
              { label: "Credits used", value: stats?.credits_used ?? 0, icon: BarChart3 },
              { label: "Storage", value: fmtBytes(Number(stats?.storage_used_bytes ?? 0)), icon: Boxes },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <s.icon className="h-4 w-4 text-[#0A4FE8]" />
                <p className="mt-2 text-2xl font-black text-[#07133B]">{s.value}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tools table */}
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3.5"><h2 className="text-[15px] font-bold text-[#07133B]">Tools ({data?.tools.length || 0})</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="px-5 py-3">Tool</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Roles</th>
                    <th className="px-3 py-3">Credits</th><th className="px-3 py-3">Status</th><th className="px-5 py-3 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data?.tools.map((t) => (
                    <tr key={t.slug} className="text-[13px]">
                      <td className="px-5 py-3">
                        <p className="font-bold text-[#07133B]">{t.name} {t.isNew && <span className="ml-1 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-bold text-emerald-700">NEW</span>}{t.isBeta && <span className="ml-1 rounded bg-violet-50 px-1 py-0.5 text-[9px] font-bold text-violet-700">BETA</span>}</p>
                        <p className="max-w-md truncate text-[11px] text-gray-400">{t.shortDescription}</p>
                      </td>
                      <td className="px-3 py-3 text-gray-500">{t.category}</td>
                      <td className="px-3 py-3 text-[11px] text-gray-500">{t.roleAccess.join(", ")}</td>
                      <td className="px-3 py-3 font-semibold text-gray-600">{t.creditCost === 0 ? "Free" : t.creditCost}</td>
                      <td className="px-3 py-3">
                        <select value={t.status} onChange={(e) => quickStatus(t, e.target.value as Tool["status"])} className={`rounded-full border-0 px-2.5 py-1 text-[10px] font-bold uppercase outline-none ${STATUS_STYLE[t.status]}`}>
                          <option value="active">active</option><option value="maintenance">maintenance</option><option value="disabled">disabled</option>
                        </select>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => setEditing(t)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Top tools */}
          {(data?.topTools?.length || 0) > 0 && (
            <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-[15px] font-bold text-[#07133B]">Most used tools</h2>
              <div className="space-y-2">
                {data!.topTools.map((row) => (
                  <div key={row.tool_slug} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-[12px]">
                    <span className="font-semibold text-[#07133B]">{row.tool_slug}</span>
                    <span className="text-gray-500">{row.runs} run{row.runs === 1 ? "" : "s"} - {row.credits} credits</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {editing && <EditToolModal tool={editing} onClose={() => setEditing(null)} onSave={saveTool} saving={saving} />}
    </main>
  );
}

function EditToolModal({ tool, onClose, onSave, saving }: { tool: Tool; onClose: () => void; onSave: (t: Tool) => void; saving: boolean }) {
  const [draft, setDraft] = useState<Tool>(tool);
  const set = (patch: Partial<Tool>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleRole = (role: Role) => set({ roleAccess: draft.roleAccess.includes(role) ? draft.roleAccess.filter((r) => r !== role) : [...draft.roleAccess, role] });

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#07133B]/50 p-4 backdrop-blur-sm sm:p-6">
      <div onClick={(e) => e.stopPropagation()} className="my-6 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-[15px] font-bold text-[#07133B]">Edit {tool.name}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block text-[12px] font-semibold text-gray-600">Name<input value={draft.name} onChange={(e) => set({ name: e.target.value })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-blue-300 focus:bg-white" /></label>
          <label className="block text-[12px] font-semibold text-gray-600">Short description<textarea value={draft.shortDescription} onChange={(e) => set({ shortDescription: e.target.value })} rows={2} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] outline-none focus:border-blue-300 focus:bg-white" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12px] font-semibold text-gray-600">Category<input value={draft.category} onChange={(e) => set({ category: e.target.value })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-blue-300 focus:bg-white" /></label>
            <label className="block text-[12px] font-semibold text-gray-600">Credit cost<input type="number" min={0} value={draft.creditCost} onChange={(e) => set({ creditCost: Math.max(0, Number(e.target.value) || 0) })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-blue-300 focus:bg-white" /></label>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-gray-600">Role access</p>
            <div className="flex gap-2">
              {(["client", "team", "admin"] as Role[]).map((r) => (
                <button key={r} type="button" onClick={() => toggleRole(r)} className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold capitalize ${draft.roleAccess.includes(r) ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-gray-200 text-gray-500"}`}>{draft.roleAccess.includes(r) && <Check className="mr-1 inline h-3 w-3" />}{r}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            {([["isFeatured", "Featured"], ["isNew", "New"], ["isBeta", "Beta"]] as [keyof Tool, string][]).map(([key, label]) => (
              <label key={String(key)} className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-600"><input type="checkbox" checked={Boolean(draft[key])} onChange={(e) => set({ [key]: e.target.checked } as Partial<Tool>)} className="h-4 w-4 rounded" /> {label}</label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-500 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onSave(draft)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</button>
        </div>
      </div>
    </div>
  );
}
