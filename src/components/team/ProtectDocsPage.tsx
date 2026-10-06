"use client";

 

import { useEffect, useState } from "react";
import { Shield, Lock, FileText, Loader2, Plus, Search, Trash2, Download, Eye, X as XIcon, FileKey, Paperclip } from "lucide-react";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface Doc {
  id: string;
  title: string;
  description: string | null;
  kind: "generic" | "brief" | "env" | "contract" | "asset" | "cdocs";
  visibility: "project_team" | "specific_members" | "admin_only" | "public" | "all_team" | "department";
  has_password: boolean;
  file_path_present: boolean;
  file_mime: string | null;
  file_size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_by_admin: boolean;
  created_at: string;
}

const KIND_LABEL: Record<string, string> = {
  generic: "Note",
  brief: "Brief",
  env: ".env / Secrets",
  contract: "Contract",
  asset: "Asset",
  cdocs: "cDocs link",
};

export default function ProtectDocsPage({ variant = "team" }: { variant?: "team" | "admin" }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [opened, setOpened] = useState<{ doc: Doc; body: string | null; fileUrl: string | null } | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<Doc | null>(null);

  async function fetchDocs() {
    setLoading(true);
    const r = await fetch("/api/protect-docs", { cache: "no-store" });
    const j = await r.json();
    if (j.ok) setDocs(j.docs);
    setLoading(false);
  }
  useEffect(() => { fetchDocs(); }, []);

  const filtered = docs.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()));

  async function openDoc(d: Doc, password?: string) {
    const params = new URLSearchParams();
    if (password) params.set("password", password);
    const r = await fetch(`/api/protect-docs/${d.id}?${params}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) {
      if (j.password_required) { setPasswordPrompt(d); return; }
      appAlert(j.error || "Couldn't open");
      return;
    }
    setPasswordPrompt(null);
    setOpened({ doc: j.doc, body: j.doc.body || null, fileUrl: j.doc.file_signed_url || null });
  }

  async function remove(d: Doc) {
    if (!(await appConfirm(`Delete "${d.title}"?`))) return;
    await fetch(`/api/protect-docs/${d.id}`, { method: "DELETE" });
    fetchDocs();
  }

  return (
    <div className={`px-0 py-1 md:p-6 lg:p-8 ${variant === "admin" ? "max-w-[1200px]" : "max-w-[1100px]"}`}>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          {variant === "admin" && <p className="text-[#0A4FE8] text-sm font-semibold">Workspace</p>}
          <h1 className="text-[26px] font-bold text-[#0D1B39] tracking-tight">Protect Docs</h1>
          <p className="text-gray-400 text-[13px] mt-1">
            Vault for briefs, secrets (.env), contracts, and assets with optional per-file passwords and visibility rules.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex w-full md:w-auto items-center justify-center gap-2 px-5 py-3 bg-[#0A4FE8] text-white text-[13px] font-medium rounded-2xl hover:bg-[#083EC0]">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      <div className="mb-4 relative md:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-gray-200 text-[12.5px]" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-14 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-[13px] text-gray-400">Empty vault. Create the first protected doc.</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {filtered.map((d) => (
                <li key={d.id} className="px-4 sm:px-5 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${d.kind === "env" ? "bg-amber-100 text-amber-700" : "bg-[#0A4FE8]/10 text-[#0A4FE8]"}`}>
                        {d.kind === "env" ? <FileKey className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[13.5px] font-semibold text-[#0D1B39] truncate">{d.title}</p>
                          {d.has_password && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1 flex flex-wrap items-center gap-2">
                          <span>{KIND_LABEL[d.kind] || "Doc"}</span>
                          <span>{d.visibility.replace(/_/g, " ")}</span>
                          <span>{new Date(d.created_at).toLocaleDateString()}</span>
                          {d.file_path_present && <span><Paperclip className="w-2.5 h-2.5 inline" /> file</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:shrink-0">
                      <button onClick={() => openDoc(d)} className="inline-flex flex-1 sm:flex-none items-center justify-center p-2.5 rounded-xl text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50" title="Open"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => remove(d)} className="inline-flex flex-1 sm:flex-none items-center justify-center p-2.5 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchDocs(); }} />}
      {passwordPrompt && <PasswordPrompt doc={passwordPrompt} onClose={() => setPasswordPrompt(null)} onSubmit={(pw) => openDoc(passwordPrompt, pw)} />}
      {opened && <ViewModal {...opened} onClose={() => setOpened(null)} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("generic");
  const [visibility, setVisibility] = useState("all_team");
  const [password, setPassword] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!title.trim()) { setError("Title required"); return; }
    setSaving(true);
    const fd = new FormData();
    fd.set("title", title);
    fd.set("description", description);
    fd.set("kind", kind);
    fd.set("visibility", visibility);
    if (password) fd.set("password", password);
    if (body) fd.set("body", body);
    if (file) fd.set("file", file);
    const r = await fetch("/api/protect-docs", { method: "POST", body: fd });
    const j = await r.json();
    setSaving(false);
    if (!r.ok || !j.ok) { setError(j.error || "Couldn't create"); return; }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[#0D1B39]">New protected doc</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50"><XIcon className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <Field label="Title *" value={title} onChange={setTitle} />
          <Field label="Description" value={description} onChange={setDescription} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Kind</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]">
                <option value="generic">Note</option>
                <option value="brief">Brief</option>
                <option value="env">.env / Secrets</option>
                <option value="contract">Contract</option>
                <option value="asset">Asset</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Visibility</label>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]">
                <option value="all_team">All team</option>
                <option value="department">Department</option>
                <option value="specific_members">Specific members</option>
                <option value="admin_only">Admin only</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>
          <Field label="Password (optional)" type="password" value={password} onChange={setPassword} />
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Text body (optional)</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[12.5px] font-mono" placeholder="e.g. DATABASE_URL=…" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">File (optional)</label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[12px]" />
          </div>
          {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12px] px-4 py-2.5">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <button onClick={submit} disabled={saving} className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-[13px] font-medium hover:bg-[#083EC0] disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} Create
          </button>
          <button onClick={onClose} className="w-full sm:w-auto px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PasswordPrompt({ doc, onClose, onSubmit }: { doc: Doc; onClose: () => void; onSubmit: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-500" />
          <h3 className="text-[14px] font-semibold text-[#0D1B39]">Enter password</h3>
        </div>
        <div className="p-5">
          <p className="text-[12px] text-gray-500 mb-2">{doc.title}</p>
          <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSubmit(pw)} className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]" />
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => onSubmit(pw)} className="px-4 py-2 rounded-xl bg-[#0A4FE8] text-white text-[12.5px] font-medium">Unlock</button>
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-[12.5px]">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewModal({ doc, body, fileUrl, onClose }: { doc: Doc; body: string | null; fileUrl: string | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0D1B39]">{doc.title}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">{KIND_LABEL[doc.kind] || "Doc"} · {doc.visibility.replace(/_/g, " ")}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50"><XIcon className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {body && (
            <pre className="font-mono text-[12px] bg-gray-50 border border-gray-100 rounded-xl p-4 whitespace-pre-wrap break-all text-[#0D1B39]">{body}</pre>
          )}
          {fileUrl && (
            <a href={fileUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-[12.5px] font-medium">
              <Download className="w-4 h-4" /> Download file
            </a>
          )}
          {!body && !fileUrl && <p className="text-[12.5px] text-gray-400">Empty document.</p>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]" />
    </div>
  );
}
