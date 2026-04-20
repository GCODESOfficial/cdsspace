'use client';

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar, Mail, Phone, Building2, DollarSign, MessageSquare, Paperclip, Trash2, Search } from "lucide-react";

interface Consultation {
  id: string;
  full_name: string;
  email: string;
  company: string | null;
  budget_range: string | null;
  message: string | null;
  how_heard: string | null;
  file_urls: string[];
  status: "new" | "reviewing" | "scheduled" | "completed" | "archived";
  notes: string | null;
  scheduled_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  new:        "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  reviewing:  "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  scheduled:  "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  completed:  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  archived:   "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

export default function ConsultationsPage() {
  const [list, setList] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Consultation | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/admin/consultations");
    const d = await r.json();
    setList(d.consultations ?? []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/admin/consultations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (active?.id === id) setActive({ ...active, status: status as Consultation["status"] });
    load();
  };
  const updateNotes = async (id: string, notes: string) => {
    await fetch(`/api/admin/consultations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this consultation request?")) return;
    await fetch(`/api/admin/consultations/${id}`, { method: "DELETE" });
    setActive(null); load();
  };

  const filtered = list.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.full_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q)
    );
  });

  const counts = {
    all: list.length,
    new: list.filter((c) => c.status === "new").length,
    reviewing: list.filter((c) => c.status === "reviewing").length,
    scheduled: list.filter((c) => c.status === "scheduled").length,
    completed: list.filter((c) => c.status === "completed").length,
  };

  return (
    <div className="p-8 min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="max-w-[1500px] mx-auto">
        <div className="mb-8">
          <h1 className="text-[34px] leading-tight font-bold text-gray-900 tracking-tight">Consultation Requests</h1>
          <p className="text-gray-500 mt-1">Sessions and consultations booked from the landing page.</p>
        </div>

        {/* filter pills */}
        <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_10px_40px_rgba(15,40,90,0.06)] p-1.5 inline-flex items-center gap-1 mb-5 overflow-x-auto">
          {(["all", "new", "reviewing", "scheduled", "completed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize whitespace-nowrap transition ${filter === s ? "bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30" : "text-gray-600 hover:bg-white/70"}`}
            >
              {s} <span className="ml-1 text-[11px] opacity-70">({counts[s]})</span>
            </button>
          ))}
        </div>

        {/* search */}
        <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_10px_40px_rgba(15,40,90,0.06)] p-4 mb-6 flex items-center gap-3">
          <Search className="w-5 h-5 text-gray-400 ml-2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, or company…" className="flex-1 bg-transparent outline-none text-sm" />
          <span className="text-xs text-gray-500">{filtered.length} request{filtered.length === 1 ? "" : "s"}</span>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/70 p-10 text-center text-gray-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/70 p-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 grid place-items-center mx-auto mb-4">
              <Calendar className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No consultation requests yet</h3>
            <p className="text-gray-500 mt-1">When someone books a session, it will appear here.</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_10px_40px_rgba(15,40,90,0.06)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/50">
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-4">Name</th>
                  <th className="px-5 py-4">Email</th>
                  <th className="px-5 py-4">Company</th>
                  <th className="px-5 py-4">Budget</th>
                  <th className="px-5 py-4">Submitted</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-white/60 hover:bg-white/50 transition cursor-pointer" onClick={() => setActive(c)}>
                    <td className="px-5 py-4 font-semibold text-gray-900">{c.full_name}</td>
                    <td className="px-5 py-4 text-gray-600">{c.email}</td>
                    <td className="px-5 py-4 text-gray-500">{c.company ?? "—"}</td>
                    <td className="px-5 py-4 text-gray-500">{c.budget_range ?? "—"}</td>
                    <td className="px-5 py-4 text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-4">
                      <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-blue-600 text-xs font-medium">View →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!active} onOpenChange={(o) => { if (!o) setActive(null); }}>
        <DialogContent className="bg-white max-w-2xl rounded-2xl border-0 shadow-2xl p-0 max-h-[92vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader className="px-7 pt-7 pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-2xl text-gray-900">{active.full_name}</DialogTitle>
                    <p className="text-sm text-gray-500 mt-1">Submitted {new Date(active.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[active.status]}`}>{active.status}</span>
                </div>
              </DialogHeader>
              <div className="px-7 pb-7 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <Info icon={Mail} label="Email">{active.email}</Info>
                  {active.company && <Info icon={Building2} label="Company">{active.company}</Info>}
                  {active.budget_range && <Info icon={DollarSign} label="Budget">{active.budget_range}</Info>}
                  {active.how_heard && <Info icon={Phone} label="Heard via">{active.how_heard}</Info>}
                </div>

                {active.message && (
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-blue-700 font-semibold mb-2">
                      <MessageSquare className="w-3.5 h-3.5" /> What they want to discuss
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-line">{active.message}</p>
                  </div>
                )}

                {active.file_urls && active.file_urls.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
                      <Paperclip className="w-3.5 h-3.5" /> Attachments ({active.file_urls.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {active.file_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition text-sm text-gray-700 truncate">
                          <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{decodeURIComponent(url.split("/").pop() ?? `file-${i + 1}`)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs uppercase tracking-wide text-gray-500">Status</label>
                    <Select value={active.status} onValueChange={(v) => updateStatus(active.id, v)}>
                      <SelectTrigger className="h-11 rounded-xl mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="reviewing">Reviewing</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-gray-500">Internal notes</label>
                    <Textarea
                      defaultValue={active.notes ?? ""}
                      onBlur={(e) => updateNotes(active.id, e.target.value)}
                      className="rounded-xl mt-1.5 min-h-[80px]"
                      placeholder="Add internal notes about this lead…"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" className="rounded-xl text-red-600 border-red-200 hover:bg-red-50" onClick={() => remove(active.id)}>
                    <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                  </Button>
                  <a href={`mailto:${active.email}`} className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 text-white font-medium shadow-lg shadow-blue-600/30 hover:from-blue-600 hover:to-blue-800 transition">
                    <Mail className="w-4 h-4" /> Reply by Email
                  </a>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-sm text-gray-900 font-medium break-all">{children}</div>
    </div>
  );
}
