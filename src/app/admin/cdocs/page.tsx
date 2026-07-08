"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  Eye,
  MessageSquare,
  AtSign,
  Clock,
  Search,
  Plus,
} from "lucide-react";

interface DocSummary {
  doc_id: string;
  slug: string;
  title: string;
  department: string | null;
  current_version: number;
  word_count: number;
  read_minutes: number;
  views: number;
  unique_viewers: number;
  open_comments: number;
  total_comments: number;
  mention_count: number;
  last_viewed_at: string | null;
  is_pinned: boolean;
  is_archived: boolean;
}

export default function AdminCdocsPage() {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setLoading(true);
    const r = await fetch("/api/team/cdocs?archived=true");
    const j = await r.json();
    if (j.ok) setDocs(j.docs);
    setLoading(false);
  }
  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return docs.filter(
      (d) =>
        !q || d.title.toLowerCase().includes(q) || (d.department || "").toLowerCase().includes(q)
    );
  }, [docs, search]);

  async function createDoc() {
    setCreating(true);
    const r = await fetch("/api/team/cdocs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled document" }),
    });
    const j = await r.json();
    setCreating(false);
    if (r.ok && j.ok) window.location.href = `/team/cdocs/${j.slug}`;
  }

  const totalViews = docs.reduce((s, d) => s + d.views, 0);
  const totalComments = docs.reduce((s, d) => s + d.open_comments, 0);

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Workspace</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">cDocs</h1>
          <p className="text-gray-400 text-[13px] mt-1">
            Internal docs, knowledge base, and playbooks - versioned and commentable.
          </p>
        </div>
        <button
          onClick={createDoc}
          disabled={creating}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          New doc
        </button>
      </div>

      {/* Rollup cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        <RollupCard icon={FileText} label="Docs" value={docs.length} />
        <RollupCard icon={Eye} label="Views" value={totalViews} />
        <RollupCard icon={MessageSquare} label="Open comments" value={totalComments} />
        <RollupCard
          icon={AtSign}
          label="Mentions"
          value={docs.reduce((s, d) => s + d.mention_count, 0)}
        />
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or department…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-[#0D1B39]">
            All docs <span className="text-gray-400 font-normal">({filtered.length})</span>
          </h2>
        </div>
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-gray-400 text-sm">No docs yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((d) => (
              <Link
                key={d.doc_id}
                href={`/team/cdocs/${d.slug}`}
                className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50/50 transition group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0A4FE8] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-semibold text-[#0D1B39] group-hover:text-[#0A4FE8]">
                      {d.title}
                    </p>
                    {d.is_archived && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        Archived
                      </span>
                    )}
                    {d.is_pinned && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0A4FE8] text-white">
                        Pinned
                      </span>
                    )}
                    {d.department && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-[#0A4FE8]">
                        {d.department}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-gray-500 mt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {d.views}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {d.open_comments}/{d.total_comments}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {d.read_minutes} min
                    </span>
                    <span className="font-mono">v{d.current_version}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RollupCard({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0A4FE8] flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{label}</p>
        <p className="text-[22px] font-bold text-[#0D1B39]">{value}</p>
      </div>
    </div>
  );
}
