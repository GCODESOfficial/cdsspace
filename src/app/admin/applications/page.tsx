"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Download, Eye, X, Users, Archive, ArchiveRestore, Trash2,
  Mail, Tag, Loader2, MapPin, Briefcase, ExternalLink, Send,
} from "lucide-react";
import BulkActionBar from "@/components/admin/BulkActionBar";
import { appAlert, appConfirm, appToast } from "@/lib/app-notify";

/* ─────────────── Types & helpers ─────────────── */

interface Application {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  cover_letter: string | null;
  portfolio_link: string | null;
  resume_link: string | null;
  work_links: string[] | null;
  status: "new" | "reviewing" | "shortlisted" | "rejected" | "hired";
  admin_note: string | null;
  tracking_code: string | null;
  created_at: string;
  status_updated_at: string | null;
  is_archived: boolean;
  archived_at: string | null;
  role_id: string | null;
  role_title: string | null;
  role_type: string | null;
  role_location: string | null;
}

const STATUS_META: Record<Application["status"], { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-blue-50 text-[#0A4FE8]" },
  reviewing: { label: "Reviewing", cls: "bg-amber-50 text-amber-700" },
  shortlisted: { label: "Shortlisted", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-700" },
  hired: { label: "Hired", cls: "bg-emerald-100 text-emerald-800" },
};
const STATUS_KEYS = Object.keys(STATUS_META) as Application["status"][];

const STATUS_VIEWS = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
] as const;
type StatusView = (typeof STATUS_VIEWS)[number]["key"];

function workType(loc: string | null): "Onsite" | "Hybrid" | "Remote" | "Other" {
  const l = (loc || "").toLowerCase();
  if (l.includes("onsite") || l.includes("on-site")) return "Onsite";
  if (l.includes("hybrid")) return "Hybrid";
  if (l.includes("remote")) return "Remote";
  return "Other";
}
const WORK_TYPE_CLS: Record<string, string> = {
  Onsite: "bg-blue-50 text-[#0A4FE8]",
  Hybrid: "bg-purple-50 text-purple-600",
  Remote: "bg-emerald-50 text-emerald-600",
  Other: "bg-gray-100 text-gray-500",
};

function staffType(roleType: string | null): "Intern" | "Full staff" {
  return (roleType || "").toLowerCase().includes("intern") ? "Intern" : "Full staff";
}

function roleTypeCls(roleType: string | null) {
  const t = (roleType || "").toLowerCase();
  if (t.includes("intern")) return "bg-amber-50 text-amber-700";
  if (t.includes("full")) return "bg-blue-50 text-[#0A4FE8]";
  if (t.includes("part")) return "bg-orange-50 text-orange-600";
  if (t.includes("contract")) return "bg-emerald-50 text-emerald-600";
  if (t.includes("freelance")) return "bg-cyan-50 text-cyan-600";
  return "bg-gray-100 text-gray-600";
}

async function apiPost(action: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/admin/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
    credentials: "include",
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || "Action failed");
  return json;
}

/* ─────────────── Page ─────────────── */

export default function ApplicationsPage() {
  const [data, setData] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewItem, setViewItem] = useState<Application | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [workFilter, setWorkFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<StatusView>("active");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/applications", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not load applicants.");
      setData(json.applications as Application[]);
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not load applicants.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r) => { if (r.role_title) set.add(r.role_title); });
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((r) => {
      const matchesSearch = !q ||
        r.full_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.role_title || "").toLowerCase().includes(q);
      const matchesRole = roleFilter === "all" || r.role_title === roleFilter;
      const matchesWork = workFilter === "all" || workType(r.role_location) === workFilter;
      const matchesStaff = staffFilter === "all" || staffType(r.role_type) === staffFilter;
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      const matchesView = view === "all" || (view === "archived" ? r.is_archived : !r.is_archived);
      return matchesSearch && matchesRole && matchesWork && matchesStaff && matchesStatus && matchesView;
    });
  }, [data, search, roleFilter, workFilter, staffFilter, statusFilter, view]);

  const activeCount = data.filter((r) => !r.is_archived).length;
  const archivedCount = data.filter((r) => r.is_archived).length;

  const selectedRows = data.filter((r) => selected.has(r.id));
  const hasActive = selectedRows.some((r) => !r.is_archived);
  const hasArchived = selectedRows.some((r) => r.is_archived);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };
  const clearSelection = () => { setSelected(new Set()); setShowStatusMenu(false); };

  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    try {
      await apiPost(action, { ids: Array.from(selected), ...payload });
      clearSelection();
      await load();
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function bulkDelete() {
    if (!(await appConfirm(`Delete ${selected.size} applicant(s)? This cannot be undone.`))) return;
    await runAction("delete");
  }

  function exportCsv() {
    const rows = selectedRows.length ? selectedRows : filtered;
    const head = ["Name", "Email", "Phone", "Role", "Staff Type", "Work Type", "Status", "Applied", "Tracking", "Portfolio", "Resume"];
    const body = rows.map((r) => [
      r.full_name, r.email, r.phone || "", r.role_title || "", staffType(r.role_type), workType(r.role_location),
      STATUS_META[r.status]?.label || r.status, new Date(r.created_at).toLocaleDateString(),
      r.tracking_code || "", r.portfolio_link || "", r.resume_link || "",
    ]);
    const csv = [head, ...body].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "applicants.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const FacetRow = ({ label, options, value, onChange, accent = "blue" }: {
    label: string; options: { key: string; label: string }[]; value: string; onChange: (v: string) => void; accent?: "blue" | "navy";
  }) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1 w-[64px] shrink-0">{label}</span>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition ${
              active
                ? accent === "navy" ? "bg-[#0D1B39] text-white shadow-sm" : "bg-[#0A4FE8] text-white shadow-sm"
                : "bg-gray-50 text-gray-500 border border-gray-200 hover:border-blue-200 hover:text-[#0A4FE8]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="p-8 max-w-[1280px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">HRM</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Applicants</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="px-3 py-1.5 rounded-lg bg-blue-50 text-[#0A4FE8] text-sm font-medium flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {activeCount} active
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" /> {archivedCount} archived
          </div>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="relative mb-4">
          <BulkActionBar
            selectedCount={selected.size}
            onClear={clearSelection}
            actions={[
              { label: "Send Email", icon: <Mail className="w-4 h-4" />, onClick: () => setEmailOpen(true) },
              { label: "Set Status", icon: <Tag className="w-4 h-4" />, onClick: () => setShowStatusMenu((v) => !v) },
              ...(hasActive ? [{ label: "Archive", icon: <Archive className="w-4 h-4" />, onClick: () => runAction("archive") }] : []),
              ...(hasArchived ? [{ label: "Restore", icon: <ArchiveRestore className="w-4 h-4" />, onClick: () => runAction("unarchive") }] : []),
              { label: "Export CSV", icon: <Download className="w-4 h-4" />, onClick: exportCsv },
              { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: bulkDelete, variant: "danger" as const },
            ]}
          />
          {showStatusMenu && (
            <div className="absolute right-0 top-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg py-2 w-48 z-50">
              <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Set status</p>
              {STATUS_KEYS.map((s) => (
                <button key={s} onClick={() => runAction("update_status", { status: s })}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-[#0A4FE8] transition flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${STATUS_META[s].cls.split(" ")[0]}`} />
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Search */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder="Search by name, email, or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
            />
          </div>
        </div>

        {/* Categorisation facets */}
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col gap-3">
          <FacetRow label="Role" value={roleFilter} onChange={setRoleFilter}
            options={roleOptions.map((r) => ({ key: r, label: r === "all" ? "All Roles" : r }))} />
          <FacetRow label="Work" value={workFilter} onChange={setWorkFilter}
            options={[{ key: "all", label: "All" }, { key: "Onsite", label: "Onsite" }, { key: "Hybrid", label: "Hybrid" }, { key: "Remote", label: "Remote" }]} />
          <FacetRow label="Staff" value={staffFilter} onChange={setStaffFilter}
            options={[{ key: "all", label: "All" }, { key: "Full staff", label: "Full staff" }, { key: "Intern", label: "Intern" }]} />
          <FacetRow label="Status" value={statusFilter} onChange={setStatusFilter}
            options={[{ key: "all", label: "All" }, ...STATUS_KEYS.map((s) => ({ key: s, label: STATUS_META[s].label }))]} />
          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            <FacetRow label="Show" accent="navy" value={view} onChange={(v) => setView(v as StatusView)}
              options={STATUS_VIEWS.map((s) => ({ key: s.key, label: s.label }))} />
          </div>
        </div>

        <div className="px-6 py-3 bg-[#FBFCFF] border-b border-gray-100 text-[12px] text-gray-500">
          Showing <span className="font-semibold text-[#0D1B39]">{filtered.length}</span> applicant{filtered.length === 1 ? "" : "s"}
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#0A4FE8]" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-2.5 px-6 w-10">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] focus:ring-blue-200 cursor-pointer" />
                </th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Full Name</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Role</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Work</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Email</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="text-right py-2.5 px-6 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-gray-400 text-sm">No applicants found</td></tr>
              ) : filtered.map((r) => {
                const wt = workType(r.role_location);
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition">
                    <td className="py-3 px-6">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                        className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] focus:ring-blue-200 cursor-pointer" />
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium text-[#0D1B39]">{r.full_name}</span>
                        {r.is_archived && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            <Archive className="w-3 h-3" /> Archived
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] text-[#0D1B39]">{r.role_title || "-"}</span>
                        {r.role_type && <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${roleTypeCls(r.role_type)}`}>{staffType(r.role_type) === "Intern" ? "Intern" : r.role_type}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${WORK_TYPE_CLS[wt]}`}>{wt}</span>
                    </td>
                    <td className="py-3 px-3 text-[13px] text-gray-500">{r.email}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${STATUS_META[r.status]?.cls || "bg-gray-100 text-gray-600"}`}>
                        {STATUS_META[r.status]?.label || r.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[13px] text-gray-400">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-6">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setSelected(new Set([r.id])); setEmailOpen(true); }}
                          className="p-1.5 rounded-md text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition" title="Email applicant">
                          <Mail className="w-4 h-4" />
                        </button>
                        <button onClick={() => setViewItem(r)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition" title="View details">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {viewItem && (
        <ViewModal
          item={viewItem}
          onClose={() => setViewItem(null)}
          onChanged={load}
        />
      )}

      {emailOpen && (
        <EmailModal
          recipients={data.filter((r) => selected.has(r.id))}
          onClose={() => setEmailOpen(false)}
          onSent={() => { setEmailOpen(false); clearSelection(); }}
        />
      )}
    </div>
  );
}

/* ─────────────── View / status modal ─────────────── */

function ViewModal({ item, onClose, onChanged }: { item: Application; onClose: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState<Application["status"]>(item.status);
  const [note, setNote] = useState(item.admin_note || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiPost("update_status", { ids: [item.id], status, admin_note: note || null });
      appToast("Application updated");
      onChanged();
      onClose();
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not update");
    } finally {
      setSaving(false);
    }
  }

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex text-sm gap-3">
      <span className="w-36 flex-shrink-0 text-gray-400 font-medium">{label}</span>
      <span className="text-[#0D1B39] min-w-0 break-words">{children}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-full max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-[#0D1B39]">{item.full_name}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto max-h-[calc(85vh-128px)] p-6 space-y-3">
          <Row label="Role"><span className="inline-flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-gray-400" />{item.role_title || "-"}{item.role_type ? ` · ${item.role_type}` : ""}</span></Row>
          <Row label="Work / Location"><span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{item.role_location || "-"} ({workType(item.role_location)})</span></Row>
          <Row label="Email">{item.email}</Row>
          <Row label="Phone">{item.phone || "-"}</Row>
          <Row label="Applicant location">{item.location || "-"}</Row>
          <Row label="Tracking">{item.tracking_code || "-"}</Row>
          {item.portfolio_link && <Row label="Portfolio"><a href={item.portfolio_link} target="_blank" rel="noopener noreferrer" className="text-[#0A4FE8] inline-flex items-center gap-1 hover:underline">Open <ExternalLink className="w-3 h-3" /></a></Row>}
          {item.resume_link && <Row label="Resume"><a href={item.resume_link} target="_blank" rel="noopener noreferrer" className="text-[#0A4FE8] inline-flex items-center gap-1 hover:underline">Open <ExternalLink className="w-3 h-3" /></a></Row>}
          {item.work_links && item.work_links.length > 0 && (
            <Row label="Work links">
              <span className="flex flex-col gap-1">
                {item.work_links.map((l, i) => <a key={i} href={l} target="_blank" rel="noopener noreferrer" className="text-[#0A4FE8] inline-flex items-center gap-1 hover:underline">{l} <ExternalLink className="w-3 h-3" /></a>)}
              </span>
            </Row>
          )}
          {item.cover_letter && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-gray-400 font-medium text-sm mb-1">Cover letter</p>
              <p className="text-[13px] text-[#0D1B39] whitespace-pre-wrap leading-relaxed">{item.cover_letter}</p>
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 space-y-2">
            <label className="text-gray-400 font-medium text-sm">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Application["status"])}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
              {STATUS_KEYS.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
            <label className="text-gray-400 font-medium text-sm">Admin note (internal)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500">Close</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-[#0A4FE8] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Bulk email modal ─────────────── */

function EmailModal({ recipients, onClose, onSent }: { recipients: Application[]; onClose: () => void; onSent: () => void }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const valid = recipients.filter((r) => r.email);

  async function send() {
    if (!subject.trim() || !message.trim()) { appAlert("Subject and message are required."); return; }
    setSending(true);
    try {
      const res = await fetch("/api/admin/applications/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: valid.map((r) => r.id), subject, message }),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to send");
      const failed = json.failed?.length || 0;
      appToast(failed ? `Sent ${json.sent}/${json.total} - ${failed} failed` : `Sent ${json.sent} individual email${json.sent === 1 ? "" : "s"}`);
      onSent();
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not send emails");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-full max-h-[88vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-[#0D1B39]">Email applicants</h2>
            <p className="text-[12px] text-gray-500">Each person gets their own individual email · {valid.length} recipient{valid.length === 1 ? "" : "s"}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {valid.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-[#0A4FE8] px-2.5 py-1 text-[11px] font-medium">{r.full_name}</span>
            ))}
            {valid.length === 0 && <span className="text-[12px] text-rose-500">None of the selected applicants have an email.</span>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Update on your CDS Space application"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9}
              placeholder={"Hi {{first_name}},\n\n..."}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm resize-none leading-relaxed" />
            <p className="mt-1.5 text-[11px] text-gray-400">Personalise with <code className="text-gray-500">{"{{name}}"}</code>, <code className="text-gray-500">{"{{first_name}}"}</code>, <code className="text-gray-500">{"{{role}}"}</code>.</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500">Cancel</button>
          <button onClick={send} disabled={sending || valid.length === 0} className="px-5 py-2 rounded-xl bg-[#0A4FE8] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Sending…" : `Send to ${valid.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
