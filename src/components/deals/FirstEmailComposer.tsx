"use client";

/**
 * The first email to a company: recipients, an optional picture above the
 * message, the subject and message, a live re-audit and rewrite in the CEO's
 * voice, a preview of the email exactly as it arrives, and sending. Shared by
 * the prospect directory and the prospect checklist so an email can be sent
 * from either without leaving the page.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Mail, Plus, RefreshCw, Search, Send, X } from "lucide-react";
import { friendlyCompanyName } from "@/lib/ai/cds-voice";
import type { ProspectResearch } from "@/components/deals/ProspectResearchPanel";

type HuntedEmail = { email: string; source_url: string; kind: string; channel: string; on_domain: boolean };
type AuditFinding = { area: "ai_search" | "website" | "social" | "video"; title: string; detail: string; severity: "high" | "medium" | "low"; evidence: string };
type AiAudit = { findings: AuditFinding[]; strengths: string[]; checked: string[]; unreachable: boolean };
type Compose = {
  company: ProspectResearch;
  recipients: string[];
  subject: string;
  message: string;
  manual: string;
  hunting: boolean;
  sending: boolean;
  preview: boolean;
  hunt: { found: HuntedEmail[]; added: number; visited: string[]; channels: string[] } | null;
  rewriting: boolean;
  audit: AiAudit | null;
  showAudit: boolean;
  error: string;
  /** Optional picture above the message; only its storage path is kept. */
  cover: { path: string; previewUrl: string } | null;
  uploadingCover: boolean;
  previewHtml: string;
  previewLoading: boolean;
  /** What the writer understood about the company before it wrote. */
  reasoning: { essence: string; observation: string; why_it_matters: string } | null;
};


const AUDIT_AREA: Record<AuditFinding["area"], string> = { ai_search: "AI search", website: "Website", social: "Social branding", video: "Video" };

/** Every address the research found: decision makers first, then published mailboxes, then DNS. */
export function recipientsFor(company: ProspectResearch) {
  const ordered = [
    ...(company.contacts || []).filter((contact) => contact.seniority === "decision_maker" && contact.email).map((contact) => contact.email as string),
    ...(company.contacts || []).filter((contact) => contact.seniority !== "decision_maker" && contact.email).map((contact) => contact.email as string),
    ...(company.emails || []).map((entry) => entry.email),
    ...(company.dns_contacts || []).filter((entry) => entry.value.includes("@")).map((entry) => entry.value),
  ];
  return Array.from(new Set(ordered.map((email) => email.toLowerCase())));
}

export function FirstEmailComposer({ company, onClose, onSent, onChanged }: {
  company: ProspectResearch;
  onClose: () => void;
  /** Reports the outcome of a send to the page that opened the composer. */
  onSent: (notice: { tone: "success" | "error"; text: string }) => void;
  /** Called when the company record changed (a rewrite, a found address). */
  onChanged?: () => void;
}) {
  const [compose, setCompose] = useState<Compose | null>(() => ({
      company,
      recipients: recipientsFor(company),
      subject: company.outreach_subject || `A few observations on ${friendlyCompanyName(company.company_name)}`,
      message: company.outreach_email || "",
      manual: "",
      hunting: false,
      sending: false,
      preview: false,
      hunt: null,
      rewriting: false,
      audit: null,
      showAudit: false,
      error: "",
      cover: null,
      uploadingCover: false,
      previewHtml: "",
      previewLoading: false,
      reasoning: null,
    }));

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/admin/deals/prospect-generation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "The request could not be completed.");
    return json;
  };


  /** Uploads the optional cover at once, so only its storage path is held. */
  const uploadCover = async (file: File) => {
    if (!compose) return;
    patchCompose({ uploadingCover: true, error: "" });
    try {
      const form = new FormData();
      form.append("kind", "email_cover");
      form.append("file", file);
      const response = await fetch("/api/admin/deals/upload", { method: "POST", body: form });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "The image could not be uploaded.");
      patchCompose({ uploadingCover: false, cover: { path: json.storage_path, previewUrl: json.preview_url }, previewHtml: "" });
    } catch (error) {
      patchCompose({ uploadingCover: false, error: error instanceof Error ? error.message : "The image could not be uploaded." });
    }
  };

  /** The email exactly as it will arrive, rendered by the server that sends it. */
  const togglePreview = async () => {
    if (!compose) return;
    if (compose.preview) { patchCompose({ preview: false }); return; }
    patchCompose({ preview: true, previewLoading: true, error: "" });
    try {
      const json = await post({ action: "preview_outreach", subject: compose.subject, message: compose.message, cover_storage_path: compose.cover?.path || "" });
      patchCompose({ previewLoading: false, previewHtml: json.html || "" });
    } catch (error) {
      patchCompose({ previewLoading: false, preview: false, error: error instanceof Error ? error.message : "The preview could not be built." });
    }
  };

  const patchCompose = (patch: Partial<Compose>) => setCompose((current) => (current ? { ...current, ...patch } : current));


  /** Crawls the open web for this company right now, rather than reusing research. */
  const huntEmails = async () => {
    if (!compose) return;
    patchCompose({ hunting: true, error: "" });
    try {
      const json = await post({ action: "find_emails", id: compose.company.id });
      const found: HuntedEmail[] = json.found || [];
      setCompose((current) => {
        if (!current) return current;
        // Everything found is put on the line, because the reviewer removes what
        // does not belong far faster than they retype what does.
        const merged = Array.from(new Set([...current.recipients, ...found.map((entry) => entry.email)]));
        return { ...current, hunting: false, recipients: merged, hunt: { found, added: json.added || 0, visited: json.visited || [], channels: json.channels || [] } };
      });
      onChanged?.();
    } catch (error) {
      patchCompose({ hunting: false, error: error instanceof Error ? error.message : "The search could not be completed." });
    }
  };

  /**
   * Re-audits the company live - website, social branding, video, and how
   * readable it is to AI assistants - then has the CEO's first email written
   * from what that audit actually found.
   */
  const rewriteWithAi = async () => {
    if (!compose) return;
    patchCompose({ rewriting: true, error: "" });
    try {
      const json = await post({ action: "rewrite_outreach", id: compose.company.id });
      patchCompose({
        rewriting: false,
        subject: json.subject || compose.subject,
        message: json.message || compose.message,
        audit: json.audit || null,
        reasoning: json.reasoning || null,
        showAudit: false,
        preview: false,
      });
      onChanged?.();
    } catch (error) {
      patchCompose({ rewriting: false, error: error instanceof Error ? error.message : "The email could not be rewritten." });
    }
  };

  const addManualRecipient = async () => {
    if (!compose) return;
    const email = compose.manual.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { patchCompose({ error: "That is not a valid email address." }); return; }
    if (compose.recipients.includes(email)) { patchCompose({ manual: "", error: "" }); return; }
    patchCompose({ recipients: [...compose.recipients, email], manual: "", error: "" });
    // Kept on the company too, so the next person to open it does not have to
    // find the same address again.
    try { await post({ action: "add_email", id: compose.company.id, email }); onChanged?.(); } catch { /* the address is still usable for this send */ }
  };

  const sendOutreach = async () => {
    if (!compose) return;
    if (!compose.recipients.length) { patchCompose({ error: "Add at least one address to send to." }); return; }
    patchCompose({ sending: true, error: "" });
    try {
      const json = await post({
        action: "send_outreach",
        id: compose.company.id,
        recipients: compose.recipients,
        subject: compose.subject,
        message: compose.message,
        cover_storage_path: compose.cover?.path || "",
      });
      const failed = (json.failed || []).length;
      onClose();
      onSent({
        tone: failed ? "error" : "success",
        text: failed
          ? `Sent to ${json.sent}, but ${failed} address${failed === 1 ? "" : "es"} could not be reached.`
          : `Email sent to ${json.sent} address${json.sent === 1 ? "" : "es"}.`,
      });
    } catch (error) {
      patchCompose({ sending: false, error: error instanceof Error ? error.message : "The email could not be sent." });
    }
  };


  if (!compose) return null;
  return (
    <ComposeEmailModal
      compose={compose}
      onClose={onClose}
      onPatch={patchCompose}
      onHunt={huntEmails}
      onRewrite={rewriteWithAi}
      onAddManual={addManualRecipient}
      onSend={sendOutreach}
      onUploadCover={uploadCover}
      onTogglePreview={togglePreview}
    />
  );
}

/**
 * Writes and sends the first email to a company.
 *
 * The composer opens whether or not an address is known, because "we have no
 * address" is a task, not a dead end. It offers the two ways out: search the
 * open web for one now - the company's own contact and careers pages, press
 * coverage, job posts, filings and PDF material - or type in an address that
 * was found some other way.
 */
function ComposeEmailModal({
  compose, onClose, onPatch, onHunt, onRewrite, onAddManual, onSend, onUploadCover, onTogglePreview,
}: {
  compose: Compose;
  onClose: () => void;
  onPatch: (patch: Partial<Compose>) => void;
  onHunt: () => void;
  onRewrite: () => void;
  onAddManual: () => void;
  onSend: () => void;
  onUploadCover: (file: File) => void;
  onTogglePreview: () => void;
}) {
  const { company, recipients, hunt } = compose;
  const busy = compose.hunting || compose.sending || compose.rewriting || compose.uploadingCover;
  const coverInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div className="layer-modal-top fixed inset-0 flex items-end justify-center bg-[#040b37]/60 p-3 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => { if (!busy) onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_28px_60px_rgba(4,11,55,0.28)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0A4FE8]">Compose email</p>
            <h2 className="truncate text-lg font-bold text-[#07133B]">{company.company_name}</h2>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {compose.error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{compose.error}</p>}

          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-600">To</p>
            {recipients.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((email) => {
                  const source = hunt?.found.find((entry) => entry.email === email);
                  return (
                    <span key={email} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-xs text-slate-700">
                      <span className="font-semibold">{email}</span>
                      {source && <span className="text-slate-400">{source.channel}</span>}
                      <button
                        onClick={() => onPatch({ recipients: recipients.filter((value) => value !== email) })}
                        className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-rose-600"
                        aria-label={`Remove ${email}`}
                      ><X className="h-3 w-3" /></button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                No address is known for this company yet. Search for one, or add one below.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={compose.manual}
              onChange={(event) => onPatch({ manual: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onAddManual(); } }}
              type="email"
              placeholder="Add an address by hand"
              className="h-10 min-w-[220px] flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]"
            />
            <button onClick={onAddManual} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8]"><Plus className="h-4 w-4" /> Add</button>
            <button
              onClick={onHunt}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#0A4FE8] px-3 text-sm font-semibold text-[#0A4FE8] hover:bg-[#0A4FE8]/5 disabled:opacity-50"
            >
              {compose.hunting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {compose.hunting ? "Searching the web..." : "Find email addresses"}
            </button>
          </div>

          {compose.hunting && <p className="text-xs text-slate-500">Reading the company site, press coverage, job posts, filings and PDF material. This takes up to a minute.</p>}

          {hunt && !compose.hunting && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-600">
                {hunt.found.length ? `${hunt.found.length} address${hunt.found.length === 1 ? "" : "es"} found across ${hunt.visited.length} page${hunt.visited.length === 1 ? "" : "s"}` : `Nothing found across ${hunt.visited.length} page${hunt.visited.length === 1 ? "" : "s"}`}
                {hunt.added > 0 ? `, ${hunt.added} new and saved to this company.` : "."}
              </p>
              {hunt.found.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {hunt.found.map((entry) => (
                    <li key={entry.email} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-semibold text-[#07133B]">{entry.email}</span>
                      <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500">{entry.channel}</span>
                      {entry.on_domain && <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">own domain</span>}
                      <a href={entry.source_url} target="_blank" rel="noopener noreferrer" className="break-all text-[#0A4FE8]">{entry.source_url}</a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  Searched: {hunt.channels.join(", ") || "the open web"}. Try a social account instead, or add an address by hand.
                </p>
              )}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-600">Cover image <span className="font-normal text-slate-400">(optional)</span></p>
            <input
              ref={coverInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUploadCover(file); }}
            />
            {compose.cover ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={compose.cover.previewUrl} alt="Email cover" className="h-16 w-28 rounded-lg object-cover" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => coverInput.current?.click()} disabled={busy} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-[#0A4FE8] disabled:opacity-50">Replace</button>
                  <button type="button" onClick={() => onPatch({ cover: null, previewHtml: "" })} disabled={busy} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:border-rose-300 disabled:opacity-50">Remove</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => coverInput.current?.click()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs font-semibold text-slate-500 hover:border-[#0A4FE8] hover:text-[#0A4FE8] disabled:opacity-50">
                {compose.uploadingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {compose.uploadingCover ? "Uploading..." : "Add a picture above the message"}
              </button>
            )}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Subject</span>
            <input
              value={compose.subject}
              onChange={(event) => onPatch({ subject: event.target.value })}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]"
            />
          </label>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">Message</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={onRewrite}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#0A4FE8] px-2.5 py-1 text-xs font-semibold text-[#0A4FE8] hover:bg-[#0A4FE8]/5 disabled:opacity-50"
                  title="Re-audit the website, social branding, video and AI search readiness, then rewrite this email from what it finds"
                >
                  {compose.rewriting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {compose.rewriting ? "Studying them and writing..." : "Re-audit and rewrite with AI"}
                </button>
                <button onClick={onTogglePreview} disabled={busy} className="text-xs font-semibold text-[#0A4FE8] disabled:opacity-50">
                  {compose.preview ? "Back to editing" : "Preview"}
                </button>
              </div>
            </div>

            {compose.rewriting && <p className="mb-2 text-xs text-slate-500">Looking at the live website and social channels, working out what this company is about and what its online presence is for, then writing from the one observation that matters to them.</p>}

            {compose.reasoning && !compose.rewriting && (compose.reasoning.essence || compose.reasoning.observation) && (
              <div className="mb-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-relaxed text-slate-600">
                <p className="font-semibold text-[#07133B]">Why this angle</p>
                {compose.reasoning.essence && <p className="mt-1">{compose.reasoning.essence}</p>}
                {compose.reasoning.observation && <p className="mt-1"><span className="font-semibold text-slate-700">Leading with: </span>{compose.reasoning.observation}{compose.reasoning.why_it_matters ? ` ${compose.reasoning.why_it_matters}` : ""}</p>}
              </div>
            )}

            {compose.audit && !compose.rewriting && (
              <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <button onClick={() => onPatch({ showAudit: !compose.showAudit })} className="flex w-full items-center justify-between gap-2 text-left">
                  <span className="text-xs font-semibold text-slate-600">
                    Audit behind this email: {compose.audit.findings.length} finding{compose.audit.findings.length === 1 ? "" : "s"}
                    {compose.audit.strengths.length ? `, ${compose.audit.strengths.length} thing${compose.audit.strengths.length === 1 ? "" : "s"} done well` : ""}
                  </span>
                  {compose.showAudit ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                </button>
                {compose.showAudit && <div className="mt-2 space-y-2">
                  {compose.audit.findings.map((finding, index) => (
                    <div key={index} className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[#07133B]">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${finding.severity === "high" ? "bg-rose-50 text-rose-700" : finding.severity === "medium" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{finding.severity}</span>
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-[#0A4FE8]">{AUDIT_AREA[finding.area]}</span>
                        {finding.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{finding.detail}</p>
                      <p className="mt-1 text-[11px] break-all text-slate-400">Observed at {finding.evidence}</p>
                    </div>
                  ))}
                  {compose.audit.strengths.length > 0 && <p className="text-xs text-emerald-700">Already doing well: {compose.audit.strengths.join("; ")}</p>}
                  <p className="text-[11px] text-slate-400">Checked: {compose.audit.checked.join(", ")}. Every claim in the email above traces to one of these findings.</p>
                </div>}
              </div>
            )}
            {compose.preview ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-2.5">
                  <p className="text-sm font-bold text-[#07133B]">{compose.subject || "(no subject)"}</p>
                  <p className="mt-0.5 text-xs text-slate-400">To {recipients.join(", ") || "nobody yet"}</p>
                </div>
                {compose.previewLoading
                  ? <p className="inline-flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Building the preview</p>
                  : <iframe title="Email preview" srcDoc={compose.previewHtml} sandbox="" className="h-[520px] w-full bg-[#F4F7FB]" />}
              </div>
            ) : (
              <textarea
                rows={9}
                value={compose.message}
                onChange={(event) => onPatch({ message: event.target.value })}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm leading-relaxed outline-none focus:border-[#0A4FE8]"
              />
            )}
            <p className="mt-1.5 text-xs text-slate-400">Sent in the CEO&apos;s name, one message per recipient. Review every claim against the audit before sending.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <a
            href={`mailto:${encodeURIComponent(recipients[0] || "")}?cc=${encodeURIComponent(recipients.slice(1).join(","))}&subject=${encodeURIComponent(compose.subject)}&body=${encodeURIComponent(compose.message)}`}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8]"
          ><Mail className="h-4 w-4" /> Open in mail app</a>
          <button
            onClick={onSend}
            disabled={busy || !recipients.length || !compose.subject.trim() || !compose.message.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {compose.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {compose.sending ? "Sending..." : `Send${recipients.length > 1 ? ` to ${recipients.length}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
