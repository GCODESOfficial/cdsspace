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
    <div className="p-6 md:p-8 max-w-[1200px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-bold text-[#0D1B39] tracking-tight">cDocs</h1>
          <p className="text-gray-400 text-[13px] mt-1">Create, save, share, and sign branded documents.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#0A4FE8]/30 text-[#0A4FE8] text-[13px] font-medium hover:bg-blue-50"
          >
            <FileText className="w-4 h-4" /> Use template
          </button>
          <button
            onClick={() => createNew()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-[13px] font-medium rounded-xl hover:bg-[#083EC0]"
          >
            <Plus className="w-4 h-4" /> New document
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 text-[13px]">
        {(["active", "templates", "archived"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg font-medium capitalize transition ${
              tab === t ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            }`}
          >
            {t}
          </button>
        ))}
        <div className="ml-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[12.5px] w-60 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 rounded-xl bg-[#0A4FE8]/5 border border-[#0A4FE8]/20 px-4 py-2.5 flex items-center gap-3 text-[12.5px]">
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
          <button onClick={() => setSelected(new Set())} className="ml-auto text-gray-400 hover:text-gray-600">Clear</button>
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
              <li key={d.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50">
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} className="w-4 h-4" />
                <Link href={`/team/cdocs/${d.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[#0D1B39] truncate">{d.title}</p>
                    <p className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3" /> Edited {new Date(d.last_saved_at || d.updated_at).toLocaleString()}
                      {d.category && <><span>·</span><TagIcon className="w-3 h-3" /> {d.category}</>}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => copyShareLink(d)} className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50" title="Copy share link">
                    <Link2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => duplicate(d.id)} className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50" title="Duplicate">
                    <Copy className="w-4 h-4" />
                  </button>
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex" onClick={(e) => e.stopPropagation()}>
        <aside className="w-[200px] border-r border-gray-100 py-3 overflow-y-auto">
          {CDOC_CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCat(c.value)}
              className={`w-full text-left px-4 py-2.5 text-[13px] ${cat === c.value ? "text-[#0A4FE8] bg-blue-50 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {c.label}
            </button>
          ))}
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
