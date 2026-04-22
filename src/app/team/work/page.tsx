"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, Calendar, Loader2, Filter } from "lucide-react";

interface Assignment {
  id: string;
  work_id: number | null;
  role_on_work: string | null;
  status: "active" | "completed" | "paused" | "removed";
  assigned_at: string;
  completed_at: string | null;
  work: { id: number; title: string; category: string | null; cover_image: string | null } | null;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "paused", label: "Paused" },
];

export default function TeamWorkPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/team/work", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setAssignments(j.assignments);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? assignments : assignments.filter((a) => a.status === filter)),
    [assignments, filter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: assignments.length };
    assignments.forEach((a) => (c[a.status] = (c[a.status] || 0) + 1));
    return c;
  }, [assignments]);

  return (
    <div className="max-w-[1200px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-brand-navy tracking-tight">Work</h1>
          <p className="text-[13px] text-brand-body/60 mt-1">
            Projects you're assigned to, past and present.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 text-[12px] text-brand-body/60">
          <Filter className="w-3.5 h-3.5" />
          {assignments.length} total
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-xl text-[12px] font-medium border transition ${
                active
                  ? "bg-brand-navy text-white border-brand-navy"
                  : "bg-white text-brand-body border-brand-stroke/40 hover:border-brand-blue/40 hover:text-brand-blue"
              }`}
            >
              {f.label}
              <span className={`ml-2 text-[11px] ${active ? "text-white/70" : "text-brand-body/40"}`}>
                {counts[f.id] || 0}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-brand-stroke/30 py-16 text-center">
          <Briefcase className="w-10 h-10 text-brand-stroke mx-auto mb-4" />
          <p className="text-[14px] font-medium text-brand-navy">No work yet</p>
          <p className="text-[12px] text-brand-body/60 mt-1 max-w-sm mx-auto">
            When an admin assigns you to a project, it'll show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <WorkCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  removed: "bg-rose-50 text-rose-700 border-rose-200",
};

function WorkCard({ a }: { a: Assignment }) {
  if (!a.work) return null;
  return (
    <div className="bg-white rounded-2xl border border-brand-stroke/30 overflow-hidden hover:border-brand-blue/40 hover:shadow-[0_12px_28px_rgba(28,78,209,0.06)] transition group">
      <div className="aspect-[16/10] bg-brand-bg border-b border-brand-stroke/30 relative overflow-hidden">
        {a.work.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.work.cover_image}
            alt={a.work.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Briefcase className="w-8 h-8 text-brand-stroke" />
          </div>
        )}
        <span
          className={`absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border ${
            STATUS_COLORS[a.status] || "bg-gray-100 text-gray-600"
          }`}
        >
          {a.status}
        </span>
      </div>
      <div className="p-4">
        <p className="text-[14px] font-bold text-brand-navy truncate">{a.work.title}</p>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-brand-body/60">
          {a.work.category && <span>{a.work.category}</span>}
          {a.role_on_work && <span>· {a.role_on_work}</span>}
        </div>
        <p className="text-[11px] text-brand-body/50 mt-2 inline-flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          Assigned {new Date(a.assigned_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
