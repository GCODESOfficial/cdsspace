"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Plus, Archive, ArchiveRestore, Trash2, Copy, Link2, Loader2, Search, Clock, Tag as TagIcon } from "lucide-react";
import { CDOC_CATEGORIES, CDOC_SUBCATEGORIES } from "@/lib/cdocs-categories";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface Doc {
  id: string;
  title: string;
  body: string;
  theme: "light" | "dark";
  tags: string[];
  archived: boolean;
  is_template: boolean;
  stamped: boolean;
  share_token: string;
  category: string | null;
  subcategory: string | null;
  last_saved_at: string;
  updated_at: string;
}

export default function CDocsListPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "templates" | "archived">("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  async function fetchDocs() {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab === "archived") params.set("archived", "true");
    if (tab === "templates") params.set("templates", "true");
    const r = await fetch(`/api/cdocs?${params}`, { cache: "no-store" });
    const j = await r.json();
    if (j.ok) setDocs(j.docs);
    setLoading(false);
  }

  useEffect(() => {
    fetchDocs();
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtered = docs.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()));

  async function createNew(seedBody = "", seedTitle = "Untitled", category?: string, subcategory?: string) {
    const r = await fetch("/api/cdocs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: seedTitle, body: seedBody, category, subcategory }),
    });
    const j = await r.json();
    if (j.ok) router.push(`/team/cdocs/${j.doc.id}`);
  }

  async function bulk(action: "archive" | "unarchive" | "delete") {
    if (selected.size === 0) return;
    if (action === "delete" && !(await appConfirm(`Delete ${selected.size} document(s)? Docs with signed requests are kept.`))) return;
    await fetch("/api/cdocs/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), action }),
    });
    setSelected(new Set());
    fetchDocs();
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function duplicate(id: string) {
    const r = await fetch(`/api/cdocs/${id}/duplicate`, { method: "POST" });
    const j = await r.json();
    if (j.ok) router.push(`/team/cdocs/${j.doc.id}`);
  }

  function copyShareLink(d: Doc) {
    const url = `${window.location.origin}/cdocs/${d.share_token}`;
    navigator.clipboard.writeText(url);
  }

  return (
    <div className="max-w-[1200px] px-0 py-1 md:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-[#0D1B39] tracking-tight">cDocs</h1>
          <p className="text-gray-400 text-[13px] mt-1">Create, save, share, and sign branded documents.</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto">
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-[#0A4FE8]/30 text-[#0A4FE8] text-[13px] font-medium hover:bg-blue-50"
          >
            <FileText className="w-4 h-4" /> Use template
          </button>
          <button
            onClick={() => createNew()}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-5 py-3 bg-[#0A4FE8] text-white text-[13px] font-medium rounded-2xl hover:bg-[#083EC0]"
          >
            <Plus className="w-4 h-4" /> New document
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="grid grid-cols-2 gap-2 text-[13px] sm:flex sm:flex-wrap sm:items-center">
            {(["active", "templates", "archived"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 rounded-xl text-left font-medium capitalize transition sm:text-center ${
                  tab === t ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {t}
              </button>
            ))}
        </div>
        <div className="relative md:ml-auto md:w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 rounded-xl bg-[#0A4FE8]/5 border border-[#0A4FE8]/20 px-4 py-3 flex flex-wrap items-center gap-3 text-[12.5px]">
          <span className="font-semibold text-[#0A4FE8]">{selected.size} selected</span>
          {tab === "active" && (
            <button onClick={() => bulk("archive")} className="inline-flex items-center gap-1.5 text-gray-600 hover:text-[#0A4FE8]">
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
          )}
          {tab === "archived" && (
            <button onClick={() => bulk("unarchive")} className="inline-flex items-center gap-1.5 text-gray-600 hover:text-[#0A4FE8]">
              <ArchiveRestore className="w-3.5 h-3.5" /> Restore
            </button>
          )}
          <button onClick={() => bulk("delete")} className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="text-gray-400 hover:text-gray-600 sm:ml-auto">Clear</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-14 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-[13px] text-gray-400">
            {tab === "active" ? "No documents yet. Create one to get started." : tab === "templates" ? "No templates yet." : "Nothing archived."}
          </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {filtered.map((d) => (
                <li key={d.id} className="px-4 sm:px-5 py-4 hover:bg-gray-50/50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} className="mt-2 w-4 h-4" />
                      <Link href={`/team/cdocs/${d.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-[#0D1B39] truncate">{d.title}</p>
                          <p className="text-[11px] text-gray-400 flex flex-wrap items-center gap-2 mt-1">
                            <Clock className="w-3 h-3" /> Edited {new Date(d.last_saved_at || d.updated_at).toLocaleString()}
                            {d.category && <><TagIcon className="w-3 h-3" /> {d.category}</>}
                          </p>
                        </div>
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 sm:shrink-0">
                      <button onClick={() => copyShareLink(d)} className="inline-flex flex-1 sm:flex-none items-center justify-center p-2.5 rounded-xl text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50" title="Copy share link">
                        <Link2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => duplicate(d.id)} className="inline-flex flex-1 sm:flex-none items-center justify-center p-2.5 rounded-xl text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50" title="Duplicate">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>

      {showTemplatePicker && <TemplatePicker onPick={(body, title, category, subcategory) => { setShowTemplatePicker(false); createNew(body, title, category, subcategory); }} onClose={() => setShowTemplatePicker(false)} />}
    </div>
  );
}

function TemplatePicker({ onPick, onClose }: { onPick: (body: string, title: string, category?: string, subcategory?: string) => void; onClose: () => void }) {
  const [cat, setCat] = useState<string>(CDOC_CATEGORIES[0]?.value || "general");
  const active = CDOC_CATEGORIES.find((c) => c.value === cat);
  const subs = CDOC_SUBCATEGORIES[cat] || [];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col md:flex-row" onClick={(e) => e.stopPropagation()}>
        <aside className="border-b md:border-b-0 md:w-[200px] md:border-r border-gray-100 py-3 overflow-x-auto md:overflow-y-auto">
          <div className="flex min-w-max gap-1 px-3 md:block md:min-w-0 md:px-0">
          {CDOC_CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCat(c.value)}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-[13px] md:w-full md:rounded-none md:text-left ${cat === c.value ? "text-[#0A4FE8] bg-blue-50 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {c.label}
            </button>
          ))}
          </div>
        </aside>
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-[15px] font-semibold text-[#0D1B39] mb-3">{active?.label}</h3>
          <ul className="space-y-2">
            {subs.map((it) => (
              <li key={it.value}>
                <button
                  onClick={() => onPick(it.starter || "", it.label, cat, it.value)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:border-[#0A4FE8]/30 hover:bg-blue-50/40"
                >
                  <p className="text-[13.5px] font-semibold text-[#0D1B39]">{it.label}</p>
                  {it.starter && <p className="text-[11.5px] text-gray-400 mt-0.5 line-clamp-1">{it.starter.split("\n")[0]}</p>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
