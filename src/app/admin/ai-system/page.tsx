"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Brain,
  FileText,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

type Settings = {
  enabled: boolean;
  allow_team: boolean;
  allow_public: boolean;
  daily_token_cap: number;
  default_model: string;
};

type KnowledgeDoc = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  tags: string[] | null;
  content_excerpt: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size_bytes: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Template = {
  id: string;
  slug: string;
  title: string;
  category: string;
  emoji: string | null;
  description: string | null;
  body_template: string;
  ai_seed_prompt: string | null;
  variables: unknown[];
  is_builtin: boolean;
  times_used: number;
  created_at: string;
  updated_at: string;
};

type UsageRow = {
  id: string;
  kind: string;
  actor_kind: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number | null;
  status: string;
  created_at: string;
};

type DailyUsage = {
  day: string;
  kind: string;
  calls: number;
  total_tokens: number;
  errors: number;
  avg_latency_ms: number | null;
};

type PageData = {
  settings: Settings;
  documents: KnowledgeDoc[];
  templates: Template[];
  recent_usage: UsageRow[];
  daily_usage: DailyUsage[];
};

const categories = ["resume", "cdocs", "project", "role", "chat", "custom"];

const emptyTemplateForm = {
  id: "",
  title: "",
  category: "custom",
  emoji: "📝",
  description: "",
  body_template: "",
  ai_seed_prompt: "",
  variables: "[]",
};

const emptyDocForm = {
  title: "",
  category: "resume",
  description: "",
  tags: "",
  manual_notes: "",
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminAiSystemPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docForm, setDocForm] = useState(emptyDocForm);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMsg, setTemplateMsg] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ai/system");
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load AI system");
      setData(json);
      setSettings(json.settings);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load AI system"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const usageSummary = useMemo(() => {
    const last7 = (data?.daily_usage || []).slice(0, 7);
    return {
      calls: last7.reduce((sum, row) => sum + Number(row.calls || 0), 0),
      tokens: last7.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0),
      errors: last7.reduce((sum, row) => sum + Number(row.errors || 0), 0),
    };
  }, [data]);

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ai/system", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save settings");
      setSettings(json.settings);
      setData((prev) => (prev ? { ...prev, settings: json.settings } : prev));
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save settings"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function uploadKnowledgeDocument(e: React.FormEvent) {
    e.preventDefault();
    setUploadingDoc(true);
    setError("");
    try {
      const form = new FormData();
      form.append("title", docForm.title);
      form.append("category", docForm.category);
      form.append("description", docForm.description);
      form.append("tags", docForm.tags);
      form.append("manual_notes", docForm.manual_notes);
      form.append("is_active", "true");
      if (docFile) form.append("file", docFile);

      const res = await fetch("/api/admin/ai/documents", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to upload document");

      setDocForm(emptyDocForm);
      setDocFile(null);
      setData((prev) =>
        prev
          ? { ...prev, documents: [json.document, ...prev.documents].slice(0, 50) }
          : prev
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to upload document"));
    } finally {
      setUploadingDoc(false);
    }
  }

  async function deleteDocument(id: string) {
    const res = await fetch(`/api/admin/ai/documents/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.error || "Failed to delete document");
      return;
    }
    setData((prev) =>
      prev
        ? { ...prev, documents: prev.documents.filter((doc) => doc.id !== id) }
        : prev
    );
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSavingTemplate(true);
    setTemplateMsg("");
    setError("");
    try {
      const payload = {
        title: templateForm.title,
        category: templateForm.category,
        emoji: templateForm.emoji,
        description: templateForm.description,
        body_template: templateForm.body_template,
        ai_seed_prompt: templateForm.ai_seed_prompt,
        variables: JSON.parse(templateForm.variables || "[]"),
      };
      const isEditing = !!templateForm.id;
      const res = await fetch(
        isEditing ? `/api/admin/ai/templates/${templateForm.id}` : "/api/ai/templates",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save template");

      const savedTemplate = json.template;
      setData((prev) => {
        if (!prev) return prev;
        const next = isEditing
          ? prev.templates.map((tpl) => (tpl.id === savedTemplate.id ? savedTemplate : tpl))
          : [savedTemplate, ...prev.templates];
        return { ...prev, templates: next };
      });
      setTemplateForm(emptyTemplateForm);
      setTemplateMsg(isEditing ? "Template updated." : "Template created.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save template"));
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/admin/ai/templates/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.error || "Failed to delete template");
      return;
    }
    setData((prev) =>
      prev
        ? { ...prev, templates: prev.templates.filter((tpl) => tpl.id !== id) }
        : prev
    );
    if (templateForm.id === id) setTemplateForm(emptyTemplateForm);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-[#0D1B39]">
        <Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" />
        Loading AI system...
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1440px] space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Admin Workspace</p>
          <h1 className="text-[30px] font-bold text-[#0D1B39] tracking-tight">AI System</h1>
          <p className="text-[13px] text-gray-500 mt-1 max-w-2xl">
            Train the assistants with internal documents, tune model access, and manage reusable templates for resume, cDocs, project, and role generation.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-[13px] font-medium text-[#0D1B39] hover:border-blue-200 hover:bg-blue-50/60"
        >
          <RefreshCw className="w-4 h-4 text-[#0A4FE8]" />
          Refresh data
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <SummaryCard
          icon={<Bot className="w-5 h-5 text-[#0A4FE8]" />}
          label="Calls, last 7 days"
          value={usageSummary.calls.toLocaleString()}
          hint={`${usageSummary.tokens.toLocaleString()} tokens processed`}
        />
        <SummaryCard
          icon={<Brain className="w-5 h-5 text-emerald-600" />}
          label="Knowledge documents"
          value={String(data?.documents.length || 0)}
          hint="Used as reference context for AI generation"
        />
        <SummaryCard
          icon={<LayoutTemplate className="w-5 h-5 text-amber-600" />}
          label="Templates"
          value={String(data?.templates.length || 0)}
          hint={`${data?.templates.filter((tpl) => tpl.is_builtin).length || 0} built-in, ${data?.templates.filter((tpl) => !tpl.is_builtin).length || 0} custom`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1.35fr] gap-6">
        <Card
          title="AI Settings"
          subtitle="Turn features on or off, control access, and pin the default model."
          action={
            <button
              onClick={saveSettings}
              disabled={!settings || savingSettings}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0A4FE8] text-white text-[12px] font-semibold hover:bg-[#083EC0] disabled:opacity-50"
            >
              {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save settings
            </button>
          }
        >
          {settings && (
            <div className="space-y-4">
              <ToggleRow
                label="AI enabled"
                description="Master switch for all generation endpoints."
                checked={settings.enabled}
                onChange={(checked) => setSettings({ ...settings, enabled: checked })}
              />
              <ToggleRow
                label="Allow team access"
                description="Lets signed-in team members use AI fill and workspace assist tools."
                checked={settings.allow_team}
                onChange={(checked) => setSettings({ ...settings, allow_team: checked })}
              />
              <ToggleRow
                label="Allow public access"
                description="Allows public-facing AI helpers where the site uses them."
                checked={settings.allow_public}
                onChange={(checked) => setSettings({ ...settings, allow_public: checked })}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Default model"
                  value={settings.default_model}
                  onChange={(value) => setSettings({ ...settings, default_model: value })}
                  placeholder="gpt-4o-mini"
                />
                <Field
                  label="Daily token cap"
                  value={String(settings.daily_token_cap)}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      daily_token_cap: Math.max(0, Number(value || 0)),
                    })
                  }
                  placeholder="200000"
                />
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Usage Snapshot"
          subtitle="Recent calls and the latest daily rollups."
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(data?.daily_usage || []).slice(0, 4).map((row) => (
                <div key={`${row.day}-${row.kind}`} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">{row.kind}</p>
                  <p className="mt-1 text-[22px] font-bold text-[#0D1B39]">{row.total_tokens.toLocaleString()}</p>
                  <p className="text-[12px] text-gray-500">
                    {row.calls} calls on {new Date(row.day).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-[1.1fr_0.7fr_0.8fr_0.8fr_0.8fr] bg-gray-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400">
                <span>Kind</span>
                <span>Status</span>
                <span>Actor</span>
                <span>Tokens</span>
                <span>Time</span>
              </div>
              {(data?.recent_usage || []).length ? (
                (data?.recent_usage || []).map((row) => (
                  <div key={row.id} className="grid grid-cols-[1.1fr_0.7fr_0.8fr_0.8fr_0.8fr] items-center px-4 py-3 text-[12px] text-[#0D1B39] border-t border-gray-100">
                    <span className="truncate">{row.kind}</span>
                    <span className={row.status === "ok" ? "text-emerald-600" : "text-rose-600"}>{row.status}</span>
                    <span className="text-gray-500">{row.actor_kind}</span>
                    <span>{(Number(row.prompt_tokens || 0) + Number(row.completion_tokens || 0)).toLocaleString()}</span>
                    <span className="text-gray-500">{new Date(row.created_at).toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-[13px] text-gray-500">No usage yet.</div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
        <Card
          title="Knowledge Documents"
          subtitle="Upload docs, playbooks, and notes that should steer AI output."
        >
          <form onSubmit={uploadKnowledgeDocument} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="Title"
                value={docForm.title}
                onChange={(value) => setDocForm({ ...docForm, title: value })}
                placeholder="Resume voice guide"
              />
              <SelectField
                label="Category"
                value={docForm.category}
                onChange={(value) => setDocForm({ ...docForm, category: value })}
                options={categories}
              />
            </div>
            <Field
              label="Tags"
              value={docForm.tags}
              onChange={(value) => setDocForm({ ...docForm, tags: value })}
              placeholder="tone, hiring, resumes"
            />
            <Textarea
              label="Description"
              value={docForm.description}
              onChange={(value) => setDocForm({ ...docForm, description: value })}
              rows={3}
              placeholder="What this source should teach the system."
            />
            <Textarea
              label="Manual notes"
              value={docForm.manual_notes}
              onChange={(value) => setDocForm({ ...docForm, manual_notes: value })}
              rows={5}
              placeholder="Add direct training notes here. This is especially helpful when the uploaded file is a PDF or image-heavy doc."
            />

            <label className="block rounded-2xl border border-dashed border-blue-200 bg-blue-50/70 px-4 py-4 cursor-pointer hover:bg-blue-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white border border-blue-100 flex items-center justify-center">
                  <Upload className="w-4 h-4 text-[#0A4FE8]" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#0D1B39]">
                    {docFile ? docFile.name : "Upload a training document"}
                  </p>
                  <p className="text-[12px] text-gray-500">Best text extraction: `.txt`, `.md`, `.docx`, `.json`, `.csv`.</p>
                </div>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".txt,.md,.markdown,.docx,.json,.csv,.pdf"
                onChange={(e) => setDocFile(e.target.files?.[0] || null)}
              />
            </label>

            <button
              type="submit"
              disabled={uploadingDoc}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-[12px] font-semibold hover:bg-[#083EC0] disabled:opacity-50"
            >
              {uploadingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Add to knowledge base
            </button>
          </form>
        </Card>

        <Card
          title="Knowledge Library"
          subtitle="Everything the AI can reference during generation."
        >
          <div className="space-y-3">
            {(data?.documents || []).length ? (
              data!.documents.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-gray-100 p-4 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0A4FE8]">
                          {doc.category}
                        </span>
                        {!doc.is_active && (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                            inactive
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 text-[15px] font-semibold text-[#0D1B39]">{doc.title}</h3>
                      {doc.description && <p className="mt-1 text-[12px] text-gray-500">{doc.description}</p>}
                    </div>
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-rose-200 text-rose-600 text-[11px] font-semibold hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                  {doc.content_excerpt && (
                    <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-[12px] leading-5 text-gray-600">
                      {doc.content_excerpt}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px] text-gray-400">
                    {doc.file_name && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-1">
                        <FileText className="w-3 h-3" />
                        {doc.file_name}
                      </span>
                    )}
                    {(doc.tags || []).map((tag) => (
                      <span key={tag} className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                        {tag}
                      </span>
                    ))}
                    <span>Updated {new Date(doc.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-[13px] text-gray-500">
                No training documents yet.
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
        <Card
          title="Template Builder"
          subtitle="Create or edit reusable prompt-backed scaffolds."
        >
          <form onSubmit={saveTemplate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field
                label="Title"
                value={templateForm.title}
                onChange={(value) => setTemplateForm({ ...templateForm, title: value })}
                placeholder="Resume intro"
              />
              <SelectField
                label="Category"
                value={templateForm.category}
                onChange={(value) => setTemplateForm({ ...templateForm, category: value })}
                options={categories}
              />
              <Field
                label="Emoji"
                value={templateForm.emoji}
                onChange={(value) => setTemplateForm({ ...templateForm, emoji: value })}
                placeholder="📝"
              />
            </div>
            <Textarea
              label="Description"
              value={templateForm.description}
              onChange={(value) => setTemplateForm({ ...templateForm, description: value })}
              rows={2}
              placeholder="What this template is for."
            />
            <Textarea
              label="Body template"
              value={templateForm.body_template}
              onChange={(value) => setTemplateForm({ ...templateForm, body_template: value })}
              rows={10}
              placeholder={"# {{title}}\n\n## Summary\n-"}
            />
            <Textarea
              label="AI seed prompt"
              value={templateForm.ai_seed_prompt}
              onChange={(value) => setTemplateForm({ ...templateForm, ai_seed_prompt: value })}
              rows={3}
              placeholder="Optional hint used when AI drafts from this template."
            />
            <Textarea
              label="Variables JSON"
              value={templateForm.variables}
              onChange={(value) => setTemplateForm({ ...templateForm, variables: value })}
              rows={4}
              placeholder={'[{"key":"client_name","label":"Client","required":true}]'}
            />

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="submit"
                disabled={savingTemplate}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-[12px] font-semibold hover:bg-[#083EC0] disabled:opacity-50"
              >
                {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {templateForm.id ? "Update template" : "Create template"}
              </button>
              {templateForm.id && (
                <button
                  type="button"
                  onClick={() => setTemplateForm(emptyTemplateForm)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel edit
                </button>
              )}
              {templateMsg && <span className="text-[12px] text-emerald-600">{templateMsg}</span>}
            </div>
          </form>
        </Card>

        <Card
          title="Template Library"
          subtitle="Built-ins plus your custom prompt scaffolds."
        >
          <div className="space-y-3">
            {(data?.templates || []).map((tpl) => (
              <div key={tpl.id} className="rounded-2xl border border-gray-100 p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{tpl.emoji || "📝"}</span>
                      <h3 className="text-[15px] font-semibold text-[#0D1B39]">{tpl.title}</h3>
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0A4FE8]">
                        {tpl.category}
                      </span>
                      {tpl.is_builtin && (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                          built-in
                        </span>
                      )}
                    </div>
                    {tpl.description && <p className="mt-1 text-[12px] text-gray-500">{tpl.description}</p>}
                    <p className="mt-2 text-[11px] text-gray-400">Used {tpl.times_used || 0} times</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setTemplateForm({
                          id: tpl.id,
                          title: tpl.title,
                          category: tpl.category,
                          emoji: tpl.emoji || "📝",
                          description: tpl.description || "",
                          body_template: tpl.body_template,
                          ai_seed_prompt: tpl.ai_seed_prompt || "",
                          variables: JSON.stringify(tpl.variables || [], null, 2),
                        })
                      }
                      className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    {!tpl.is_builtin && (
                      <button
                        onClick={() => deleteTemplate(tpl.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-rose-200 text-rose-600 text-[11px] font-semibold hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <pre className="mt-3 rounded-xl bg-gray-50 px-3 py-3 text-[11px] leading-5 text-gray-600 whitespace-pre-wrap overflow-x-auto">
                  {tpl.body_template}
                </pre>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-gray-100 bg-white shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#0D1B39]">{title}</h2>
          {subtitle && <p className="mt-1 text-[12.5px] text-gray-500 max-w-2xl">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SummaryCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[24px] border border-gray-100 bg-white px-5 py-5 shadow-sm">
      <div className="w-11 h-11 rounded-2xl bg-gray-50 flex items-center justify-center">{icon}</div>
      <p className="mt-4 text-[30px] font-bold text-[#0D1B39]">{value}</p>
      <p className="text-[13px] font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-[12px] text-gray-400">{hint}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-2">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-[#0D1B39] focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-2">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-[#0D1B39] focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-2">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-[#0D1B39] resize-y focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
      <div>
        <p className="text-[13px] font-semibold text-[#0D1B39]">{label}</p>
        <p className="mt-1 text-[12px] text-gray-500 max-w-xl">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 rounded-full transition ${
          checked ? "bg-[#0A4FE8]" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}
