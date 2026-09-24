"use client";

/**
 * Weekly Report - the member-facing side of work tracking.
 *
 * Members submit ONE report per week (unique on team_member_id + week_start).
 * After submitting it locks into a read-only summary; the only action left is
 * "Edit report", which reopens the form to update the same week's entry.
 * Every change flows to Admin → Team Reports.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Send, CheckCircle2, CalendarRange, FileText, Lock, Pencil, X, Paperclip, Upload, Link2, ShieldCheck, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { PlatformMediaViewer } from "@/components/media/PlatformMediaViewer";

type SelfReport = {
  id?: string;
  tasks_completed: string | null;
  challenges: string | null;
  wins: string | null;
  goals_next_week: string | null;
  submitted_at: string | null;
  is_draft: boolean;
  attachments: ReportAttachment[];
};

type ReportAttachment = {
  id?: string;
  source_kind: "cdoc" | "protected" | "external" | "upload";
  source_id?: string | null;
  title: string;
  external_url?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
};

function isImageAttachment(attachment: ReportAttachment) {
  return attachment.mime_type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)(?:$|[?#])/i.test(attachment.external_url || "") || /\.(png|jpe?g|webp|gif)$/i.test(attachment.title);
}

type DocumentOption = { id: string; title: string; slug?: string };

type ReportFieldKey = "tasks_completed" | "challenges" | "wins" | "goals_next_week";

const FIELDS: { key: ReportFieldKey; label: string; placeholder: string; required?: boolean }[] = [
  { key: "tasks_completed", label: "What did you complete this week?", placeholder: "Deliverables, tasks, projects you finished or moved forward…", required: true },
  { key: "wins", label: "Wins", placeholder: "Anything that went especially well…" },
  { key: "challenges", label: "Challenges / blockers", placeholder: "What slowed you down or blocked you…" },
  { key: "goals_next_week", label: "Goals for next week", placeholder: "What you plan to get done next week…" },
];

function fmtSubmitted(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
}

export default function TeamWeeklyReportPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [week, setWeek] = useState<{ week_start: string; week_end: string } | null>(null);
  const [existing, setExisting] = useState<SelfReport | null>(null);
  const [form, setForm] = useState({ tasks_completed: "", challenges: "", wins: "", goals_next_week: "" });
  const [attachments, setAttachments] = useState<ReportAttachment[]>([]);
  const [cdocs, setCdocs] = useState<DocumentOption[]>([]);
  const [protectedDocs, setProtectedDocs] = useState<DocumentOption[]>([]);
  const [attachmentKind, setAttachmentKind] = useState<"cdoc" | "protected" | "external">("cdoc");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [externalTitle, setExternalTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/team/work-tracking");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to load");
      setWeek(j.week ?? null);
      setCdocs(j.attachment_sources?.cdocs ?? []);
      setProtectedDocs(j.attachment_sources?.protected_documents ?? []);
      const sr = j.self_report as SelfReport | null;
      setExisting(sr);
      if (sr) {
        setForm({
          tasks_completed: sr.tasks_completed ?? "",
          challenges: sr.challenges ?? "",
          wins: sr.wins ?? "",
          goals_next_week: sr.goals_next_week ?? "",
        });
        setAttachments(sr.attachments ?? []);
        setEditing(Boolean(sr.is_draft));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loading || saving || uploading) return;
    if (existing && !existing.is_draft && !editing) return;
    if (!Object.values(form).some((value) => value.trim()) && attachments.length === 0) return;
    setDraftStatus("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/team/work-tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save_self_report_draft", ...form, attachments }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Draft save failed");
        setExisting({ ...payload.self_report, attachments });
        setDraftStatus("saved");
      } catch {
        setDraftStatus("error");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [attachments, editing, existing?.is_draft, form, loading, saving, uploading]);

  const submit = useCallback(async () => {
    if (!form.tasks_completed.trim()) {
      toast.error("Tell us what you completed this week.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/team/work-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit_self_report", ...form, attachments }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Could not submit");
      setExisting(j.self_report);
      setAttachments(j.self_report.attachments ?? []);
      setEditing(false);
      setDraftStatus("idle");
      toast.success(existing ? "Weekly report updated" : "Weekly report submitted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setSaving(false);
    }
  }, [form, existing]);

  const cancelEdit = () => {
    if (existing) {
      setForm({
        tasks_completed: existing.tasks_completed ?? "",
        challenges: existing.challenges ?? "",
        wins: existing.wins ?? "",
        goals_next_week: existing.goals_next_week ?? "",
      });
      setAttachments(existing.attachments ?? []);
    }
    setEditing(false);
  };

  const addSelectedDocument = () => {
    if (attachmentKind === "external") {
      try {
        const parsed = new URL(externalUrl.trim());
        if (parsed.protocol !== "https:") throw new Error();
      } catch {
        toast.error("Enter a valid HTTPS document link.");
        return;
      }
      setAttachments((current) => [...current, { source_kind: "external", title: externalTitle.trim() || "External document", external_url: externalUrl.trim() }]);
      setExternalTitle("");
      setExternalUrl("");
      return;
    }
    const options = attachmentKind === "cdoc" ? cdocs : protectedDocs;
    const document = options.find((option) => option.id === selectedDocumentId);
    if (!document) {
      toast.error("Choose a document first.");
      return;
    }
    setAttachments((current) => current.some((item) => item.source_kind === attachmentKind && item.source_id === document.id)
      ? current
      : [...current, { source_kind: attachmentKind, source_id: document.id, title: document.title }]);
    setSelectedDocumentId("");
  };

  const uploadPdf = async (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("PDF attachments must be 5MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/team/work-tracking/upload", { method: "POST", body: formData });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Upload failed");
      setAttachments((current) => [...current, payload.attachment]);
      toast.success("PDF attached");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-24 text-brand-body/40"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const locked = !!existing && !existing.is_draft && !editing;

  return (
    <div className="max-w-[760px] space-y-5">
      <div className="relative overflow-hidden rounded-[24px] bg-[#0A4FE8] p-5 text-white sm:p-7">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <p className="text-[11px] font-semibold text-white/70">Weekly report</p>
          <h1 className="mt-1 flex items-center gap-2 text-[24px] font-bold tracking-tight sm:text-[28px]">
            <FileText className="h-6 w-6" /> Your week, in your words
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-white/85">
            {week && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange className="h-4 w-4" /> {week.week_start} → {week.week_end}
              </span>
            )}
            {existing?.submitted_at && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-400/25 px-3 py-1 text-[12px] font-semibold text-green-50">
                <CheckCircle2 className="h-3.5 w-3.5" /> Submitted {fmtSubmitted(existing.submitted_at)}
              </span>
            )}
          </div>
          <p className="mt-2 text-[12.5px] text-white/70">
            One report per week. Management compares it with your tracked work session, so be specific - it&apos;s how your effort gets seen. You can edit it any time before the week ends.
          </p>
        </div>
      </div>

      {locked ? (
        /* ---------- Locked summary ---------- */
        <div className="space-y-4 rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-brand-stroke/30 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
              <Lock className="h-3.5 w-3.5" /> Submitted &amp; locked for this week
            </span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-full border border-brand-stroke px-4 py-2 text-[13px] font-semibold text-brand-navy transition hover:border-brand-blue/40 hover:text-brand-blue"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit report
            </button>
          </div>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <p className="text-[12px] font-semibold text-brand-body/60">{f.label}</p>
              <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-brand-body/85">
                {existing?.[f.key]?.trim() || <span className="text-brand-body/35">-</span>}
              </p>
            </div>
          ))}
          {attachments.length > 0 && <AttachmentList attachments={attachments} />}
        </div>
      ) : (
        /* ---------- Editable form ---------- */
        <div className="space-y-4 rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-brand-stroke/30 sm:p-7">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-[12px] font-semibold text-brand-body/60">
                {f.label}{f.required && <span className="text-red-500"> *</span>}
              </label>
              <textarea
                value={form[f.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                rows={f.key === "tasks_completed" ? 5 : 3}
                className="mt-1.5 w-full rounded-2xl border border-brand-stroke/40 bg-brand-bg/40 px-4 py-3 text-[13.5px] leading-relaxed placeholder:text-brand-body/35 focus:border-brand-blue/50 focus:outline-none focus:ring-2 focus:ring-brand-blue/15"
              />
            </div>
          ))}
          <div className="rounded-2xl border border-brand-stroke/40 bg-brand-bg/30 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-[13px] font-semibold text-brand-navy"><Paperclip className="h-4 w-4 text-brand-blue" /> Supporting documents</p>
                <p className="mt-1 text-[11px] text-brand-body/55">Attach one of your own cDocs or Protect Docs, an HTTPS document link, or a PDF up to 5MB.</p>
              </div>
              <span className={`text-[11px] ${draftStatus === "error" ? "text-red-600" : "text-brand-body/50"}`}>
                {draftStatus === "saving" ? "Saving draft…" : draftStatus === "saved" ? "Draft saved" : draftStatus === "error" ? "Draft could not be saved" : ""}
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
              <select value={attachmentKind} onChange={(event) => { setAttachmentKind(event.target.value as typeof attachmentKind); setSelectedDocumentId(""); }} className="h-11 rounded-xl border border-brand-stroke bg-white px-3 text-[12px] text-brand-navy outline-none">
                <option value="cdoc">My cDocs</option>
                <option value="protected">My Protect Docs</option>
                <option value="external">External link</option>
              </select>
              {attachmentKind === "external" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={externalTitle} onChange={(event) => setExternalTitle(event.target.value)} placeholder="Document title" className="h-11 rounded-xl border border-brand-stroke bg-white px-3 text-[12px] outline-none" />
                  <input value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://…" inputMode="url" className="h-11 rounded-xl border border-brand-stroke bg-white px-3 text-[12px] outline-none" />
                </div>
              ) : (
                <select value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)} className="h-11 min-w-0 rounded-xl border border-brand-stroke bg-white px-3 text-[12px] text-brand-navy outline-none">
                  <option value="">Choose {attachmentKind === "cdoc" ? "a cDoc" : "a protected document"}</option>
                  {(attachmentKind === "cdoc" ? cdocs : protectedDocs).map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
                </select>
              )}
              <button type="button" onClick={addSelectedDocument} className="h-11 rounded-xl border border-blue-100 bg-blue-50 px-4 text-[12px] font-semibold text-brand-blue">Attach</button>
            </div>

            <label className="mt-2 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-brand-stroke bg-white px-4 text-[12px] font-semibold text-brand-navy">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-brand-blue" />}
              {uploading ? "Uploading PDF…" : "Upload PDF (max 5MB)"}
              <input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(event) => { void uploadPdf(event.target.files?.[0] || null); event.currentTarget.value = ""; }} className="sr-only" />
            </label>

            {attachments.length > 0 && <AttachmentList attachments={attachments} onRemove={(index) => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} />}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={submit}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-[14px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {existing ? "Save changes" : "Submit report"}
            </button>
            {existing && (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full border border-brand-stroke px-5 py-3 text-[13px] font-semibold text-brand-body/70 transition hover:bg-brand-bg/60 disabled:opacity-60"
              >
                <X className="h-4 w-4" /> Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AttachmentList({ attachments, onRemove }: { attachments: ReportAttachment[]; onRemove?: (index: number) => void }) {
  const iconFor = (kind: ReportAttachment["source_kind"]) => {
    if (kind === "protected") return ShieldCheck;
    if (kind === "external") return Link2;
    if (kind === "upload") return Upload;
    return FolderOpen;
  };
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {attachments.map((attachment, index) => {
        const Icon = iconFor(attachment.source_kind);
        const href = attachment.id
          ? `/api/team/work-tracking/attachments/${attachment.id}`
          : attachment.source_kind === "external"
            ? attachment.external_url || null
            : attachment.source_kind === "cdoc" && attachment.source_id
              ? `/team/cdocs/${attachment.source_id}`
              : attachment.source_kind === "protected" && attachment.source_id
                ? `/team/protect-docs?doc=${attachment.source_id}`
                : null;
        return (
          <div key={attachment.id || `${attachment.source_kind}-${attachment.source_id || attachment.storage_path || attachment.external_url}-${index}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-brand-stroke/40 bg-white px-3 py-2.5">
            <Icon className="h-4 w-4 shrink-0 text-brand-blue" />
            {href && isImageAttachment(attachment) ? (
              <PlatformMediaViewer url={href} title={attachment.title} detail={attachment.size_bytes ? `${Math.max(1, Math.round(attachment.size_bytes / 1024))} KB` : undefined} triggerClassName="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-brand-navy hover:text-brand-blue hover:underline">
                {attachment.title}
              </PlatformMediaViewer>
            ) : href ? (
              <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[12px] font-medium text-brand-navy hover:text-brand-blue hover:underline">{attachment.title}</a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-brand-navy">{attachment.title}</span>
            )}
            {onRemove && <button type="button" onClick={() => onRemove(index)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-brand-body/50 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${attachment.title}`}><X className="h-3.5 w-3.5" /></button>}
          </div>
        );
      })}
    </div>
  );
}
