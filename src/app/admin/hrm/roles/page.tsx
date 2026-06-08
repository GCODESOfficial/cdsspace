"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Loader2, Plus, Pencil, Save, X, Briefcase, MapPin, ToggleLeft, ToggleRight, Eye, ExternalLink, Copy, Check, Bold, List, Link2 } from "lucide-react";
import { AIAssistButton } from "@/components/ai/AIAssistButton";
import { appConfirm, appPrompt } from "@/lib/app-notify";
import FormattedRoleText from "@/components/hrm/FormattedRoleText";

interface OpenRole {
  id: string;
  title: string;
  role_type: string;
  location: string | null;
  description: string;
  requirements: string;
  perks: string | null;
  application_link: string | null;
  is_active: boolean;
  created_at: string;
}

interface RoleApplication {
  id: string;
  role_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  cover_letter: string | null;
  portfolio_link: string | null;
  resume_link: string | null;
  work_links: string[] | null;
  status: string;
  tracking_code: string | null;
  admin_note: string | null;
  created_at: string;
}

const STATUS_OPTIONS = ["new", "reviewing", "shortlisted", "rejected", "hired"] as const;
const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  reviewing: "bg-amber-50 text-amber-700 border-amber-200",
  shortlisted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  hired: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

const ROLE_TYPES = ["full-time", "part-time", "contract", "intern", "freelance"];
const TYPE_COLORS: Record<string, string> = {
  "full-time": "bg-emerald-50 text-emerald-700",
  "part-time": "bg-blue-50 text-blue-700",
  "contract": "bg-purple-50 text-purple-700",
  "intern": "bg-amber-50 text-amber-700",
  "freelance": "bg-cyan-50 text-cyan-700",
};

export default function OpenRolesAdmin() {
  const [roles, setRoles] = useState<OpenRole[]>([]);
  const [applications, setApplications] = useState<RoleApplication[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewApps, setViewApps] = useState<OpenRole | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [roleActive, setRoleActive] = useState(false);
  const { toast } = useToast();

  // Form fields
  const [title, setTitle] = useState("");
  const [roleType, setRoleType] = useState("full-time");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [perks, setPerks] = useState("");
  const [applicationLink, setApplicationLink] = useState("");

  useEffect(() => { fetchRoles(); fetchApplications(); }, []);

  async function fetchRoles() {
    setIsFetching(true);
    const { data } = await supabase.from("open_roles").select("*").order("created_at", { ascending: false });
    setRoles(data || []);
    setIsFetching(false);
  }

  async function fetchApplications() {
    const { data } = await supabase.from("role_applications").select("*").order("created_at", { ascending: false });
    setApplications(data || []);
  }

  function resetForm() {
    setTitle(""); setRoleType("full-time"); setLocation(""); setDescription("");
    setRequirements(""); setPerks(""); setApplicationLink(""); setEditId(null);
    setRoleActive(false);
  }

  function startEdit(r: OpenRole) {
    setEditId(r.id);
    setTitle(r.title);
    setRoleType(r.role_type);
    setLocation(r.location || "");
    setDescription(r.description);
    setRequirements(r.requirements);
    setPerks(r.perks || "");
    setApplicationLink(r.application_link || "");
    setRoleActive(!!r.is_active);
    setShowForm(true);
  }

  async function saveRole(publish: boolean) {
    if (!title.trim() || !description.trim() || !requirements.trim()) {
      toast({ title: "Missing fields", description: "Title, description, and requirements are required", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const payload = {
      title: title.trim(),
      role_type: roleType,
      location: location.trim() || null,
      description: description.trim(),
      requirements: requirements.trim(),
      perks: perks.trim() || null,
      application_link: applicationLink.trim() || null,
      is_active: publish,
    };
    const { error } = editId
      ? await supabase.from("open_roles").update(payload).eq("id", editId)
      : await supabase.from("open_roles").insert(payload);
    if (!error) {
      toast({ title: editId ? "Updated" : "Created", description: publish ? "Role is live on careers" : "Role saved as draft" });
      resetForm(); setShowForm(false); fetchRoles();
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setIsLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveRole(roleActive);
  }

  async function toggleActive(r: OpenRole) {
    await supabase.from("open_roles").update({ is_active: !r.is_active }).eq("id", r.id);
    fetchRoles();
  }

  async function handleDelete(id: string) {
    if (!(await appConfirm("Delete this role?"))) return;
    await supabase.from("open_roles").delete().eq("id", id);
    fetchRoles();
  }

  const appCountFor = (roleId: string) => applications.filter(a => a.role_id === roleId).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">HRM</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Open Roles</h1>
          <p className="text-gray-400 text-[13px] mt-1">Post & manage open positions on the careers page</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition">
          {showForm ? "Cancel" : <><Plus className="w-4 h-4" /> Post Role</>}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <h2 className="text-[15px] font-semibold text-[#0D1B39] mb-5">{editId ? "Edit Role" : "New Role"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Job Title *" value={title} onChange={setTitle} placeholder="e.g. Senior Brand Designer" />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Role Type *</label>
                <select value={roleType} onChange={(e) => setRoleType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer">
                  {ROLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Location" value={location} onChange={setLocation} placeholder="e.g. Remote / Uyo, Nigeria" />
              <Field label="External Application Link" value={applicationLink} onChange={setApplicationLink} placeholder="https://..." />
            </div>
            <div className="relative">
              <RichTextarea label="Description *" value={description} onChange={setDescription} rows={5} placeholder="What the role is about, day-to-day responsibilities..." />
              <div className="absolute top-0 right-0">
                <AIAssistButton
                  kind="role_description"
                  input={{ title, role_type: roleType, location, notes: description }}
                  onAccept={setDescription}
                />
              </div>
            </div>
            <div className="relative">
              <RichTextarea label="Requirements *" value={requirements} onChange={setRequirements} rows={5} placeholder="Skills, experience, qualifications..." />
              <div className="absolute top-0 right-0">
                <AIAssistButton
                  kind="role_requirements"
                  input={{ title, role_type: roleType, description }}
                  onAccept={setRequirements}
                />
              </div>
            </div>
            <div className="relative">
              <RichTextarea label="Role-specific Perks" value={perks} onChange={setPerks} rows={3} placeholder="(Optional) Benefits unique to this role" />
              <div className="absolute top-0 right-0">
                <AIAssistButton
                  kind="role_perks"
                  input={{ title, description }}
                  onAccept={setPerks}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <input
                  type="checkbox"
                  checked={roleActive}
                  onChange={(e) => setRoleActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#0A4FE8] focus:ring-blue-100"
                />
                Publish when saved
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#0A4FE8] border border-blue-100 rounded-xl hover:bg-blue-50 transition"
                >
                  <Eye className="w-4 h-4" /> Preview
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => saveRole(false)}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Draft
                </button>
                <button type="button" disabled={isLoading} onClick={() => saveRole(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Publish Live
                </button>
                <button type="button" onClick={() => { resetForm(); setShowForm(false); }}
                  className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {previewOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[86vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#0A4FE8] uppercase tracking-wider">Role Preview</p>
                <h2 className="text-lg font-bold text-[#0D1B39] truncate">{title || "Untitled role"}</h2>
              </div>
              <button onClick={() => setPreviewOpen(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-5">
                <span className={`px-2.5 py-1 rounded-md font-medium ${TYPE_COLORS[roleType] || "bg-gray-100 text-gray-600"}`}>{roleType}</span>
                {location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{location}</span>}
                <span className={roleActive ? "text-emerald-600" : "text-gray-400"}>{roleActive ? "Live after save" : "Draft after save"}</span>
              </div>
              <PreviewSection title="Description" value={description} />
              <PreviewSection title="Requirements" value={requirements} />
              {perks.trim() && <PreviewSection title="Perks" value={perks} />}
              {applicationLink.trim() && (
                <a href={applicationLink.trim()} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-sm font-semibold text-white">
                  Application Link <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-[#0D1B39]">All Roles <span className="text-gray-400 font-normal">({roles.length})</span></h2>
        </div>

        {isFetching ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
        ) : roles.length === 0 ? (
          <div className="text-center py-12">
            <Briefcase className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No roles posted yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {roles.map(r => (
              <div key={r.id} className="px-6 py-4 hover:bg-gray-50/50 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-[#0D1B39]">{r.title}</p>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${TYPE_COLORS[r.role_type] || "bg-gray-100 text-gray-600"}`}>{r.role_type}</span>
                      {!r.is_active && <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-400">DISABLED</span>}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-1">
                      {r.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.location}</span>}
                      <span>{appCountFor(r.id)} application{appCountFor(r.id) !== 1 ? "s" : ""}</span>
                      <span>{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setViewApps(r)} className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition" title="View applications">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleActive(r)} className={`p-2 rounded-lg transition ${r.is_active ? "text-green-500 hover:bg-green-50" : "text-gray-300 hover:bg-gray-100"}`} title={r.is_active ? "Disable" : "Enable"}>
                      {r.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => startEdit(r)} className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Applications drawer */}
      {viewApps && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[#0A4FE8] uppercase tracking-wider">Applications</p>
                <h2 className="text-lg font-bold text-[#0D1B39]">{viewApps.title}</h2>
              </div>
              <button onClick={() => setViewApps(null)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {applications.filter(a => a.role_id === viewApps.id).length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">No applications yet</p>
              ) : (
                <div className="space-y-3">
                  {applications.filter(a => a.role_id === viewApps.id).map(app => (
                    <ApplicationCard key={app.id} app={app} onRefresh={fetchApplications} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApplicationCard({ app, onRefresh }: { app: RoleApplication; onRefresh: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(app.status);
  const [note, setNote] = useState(app.admin_note || "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const dirty = status !== app.status || note !== (app.admin_note || "");

  async function save() {
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("role_applications")
      .update({ status, admin_note: note.trim() || null })
      .eq("id", app.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Application updated" });
      onRefresh();
    }
  }

  function copyCode() {
    if (!app.tracking_code) return;
    navigator.clipboard.writeText(app.tracking_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
      <div className="flex items-start justify-between mb-2 gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[#0D1B39]">{app.full_name}</p>
          <p className="text-[12px] text-gray-500 truncate">{app.email} · {app.phone || "no phone"}</p>
          {app.location && <p className="text-[11px] text-gray-400 mt-0.5">{app.location}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${STATUS_COLORS[app.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
            {app.status}
          </span>
          <span className="text-[10px] text-gray-300">{new Date(app.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {app.tracking_code && (
        <button
          onClick={copyCode}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono text-gray-500 hover:text-[#0A4FE8] transition mb-2"
        >
          {app.tracking_code}
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </button>
      )}

      {app.cover_letter && <p className="text-[12px] text-gray-600 mt-2 whitespace-pre-line">{app.cover_letter}</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        {app.portfolio_link && <LinkBadge href={app.portfolio_link} label="Portfolio" />}
        {app.resume_link && <LinkBadge href={app.resume_link} label="Resume" />}
        {app.work_links?.map((l, i) => <LinkBadge key={i} href={l} label={`Work ${i + 1}`} />)}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
        <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
          <label className="text-[11px] font-medium text-gray-500">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-100 capitalize"
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
          <label className="text-[11px] font-medium text-gray-500 pt-2">Note to applicant</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional — the applicant will see this on their status check"
            className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-[12px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        {dirty && (
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0A4FE8] text-white text-[12px] font-medium rounded-lg hover:bg-[#083EC0] transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LinkBadge({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-[#0A4FE8] text-[11px] font-medium hover:bg-blue-100 transition">
      {label} <ExternalLink className="w-3 h-3" />
    </a>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
    </div>
  );
}

function PreviewSection({ title, value }: { title: string; value: string }) {
  return (
    <section className="mb-5">
      <h3 className="text-sm font-semibold text-[#0D1B39]">{title}</h3>
      <FormattedRoleText value={value} className="mt-2" />
    </section>
  );
}

function RichTextarea({ label, value, onChange, rows, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows: number; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function replaceSelection(nextValue: string, selectionStart?: number, selectionEnd?: number) {
    onChange(nextValue);
    requestAnimationFrame(() => {
      ref.current?.focus();
      if (selectionStart != null && selectionEnd != null) ref.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function wrapSelection(prefix: string, suffix = prefix) {
    const textarea = ref.current;
    if (!textarea) return onChange(`${value}${prefix}${suffix}`);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || "text";
    const replacement = `${prefix}${selected}${suffix}`;
    replaceSelection(`${value.slice(0, start)}${replacement}${value.slice(end)}`, start + prefix.length, start + prefix.length + selected.length);
  }

  function bulletSelection() {
    const textarea = ref.current;
    if (!textarea) return onChange(`${value}\n- `);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || "List item";
    const replacement = selected
      .split(/\r?\n/)
      .map((line) => line.trim() ? `- ${line.replace(/^[-*•]\s+/, "")}` : line)
      .join("\n");
    replaceSelection(`${value.slice(0, start)}${replacement}${value.slice(end)}`, start, start + replacement.length);
  }

  async function insertLink() {
    const href = await appPrompt({
      title: "Add link",
      message: "Paste the URL to use in this role section.",
      placeholder: "https://...",
      inputType: "url",
      defaultValue: "https://",
    });
    if (href === null) return;
    const trimmedHref = href.trim();
    if (!trimmedHref) return;
    const textarea = ref.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || "Link text";
    const replacement = `[${selected}](${trimmedHref})`;
    replaceSelection(`${value.slice(0, start)}${replacement}${value.slice(end)}`, start + 1, start + 1 + selected.length);
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
        <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-white/70 px-2 py-1.5">
          <FormatButton onClick={() => wrapSelection("**")} title="Bold">
            <Bold className="w-4 h-4" />
          </FormatButton>
          <FormatButton onClick={bulletSelection} title="Bullets">
            <List className="w-4 h-4" />
          </FormatButton>
          <FormatButton onClick={insertLink} title="Inline link">
            <Link2 className="w-4 h-4" />
          </FormatButton>
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none"
        />
      </div>
    </div>
  );
}

function FormatButton({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 transition hover:bg-blue-50 hover:text-[#0A4FE8]"
    >
      {children}
    </button>
  );
}
