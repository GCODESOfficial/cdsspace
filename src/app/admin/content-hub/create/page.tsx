"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PenLine, Sparkles, Image as ImageIcon, Video, Wand2, Loader2, Check, X, Upload,
  ChevronLeft, ChevronRight, Megaphone, CalendarClock, ShieldCheck, FileText, Hash,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { appAlert } from "@/lib/app-notify";
import ContentHubShell from "@/components/content-hub/ContentHubShell";
import {
  PLATFORMS, CONTENT_TYPES, CATEGORIES, TONES, ENHANCE_ACTIONS, CTA_PRESETS,
  REMINDER_OFFSETS, REMINDER_CHANNELS, mediaKindFromMime, type MediaKind, type ContentSource,
} from "@/lib/content-hub/shared";

interface Publisher { id: string; full_name: string; role_title: string | null; department: string | null }
interface Attachment { url: string; kind: MediaKind; file_name: string | null; mime_type: string | null; size_bytes: number | null }

const STEPS = ["Source", "Details", "AI Enhance", "CTA", "Media", "Schedule", "Approval"];

export default function CreateContentPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [publishers, setPublishers] = useState<Publisher[]>([]);

  // ── form state ──
  const [source, setSource] = useState<ContentSource>("manual");
  const [brief, setBrief] = useState({ topic: "", audience: "", platform: "", tone: "cdsspace", objective: "" });
  const [sourceMedia, setSourceMedia] = useState<Attachment | null>(null);
  const [sourceNote, setSourceNote] = useState("");

  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [category, setCategory] = useState("");
  const [contentType, setContentType] = useState("Marketing");
  const [platforms, setPlatforms] = useState<string[]>([]);

  const [cta, setCta] = useState({ cta_label: "", cta_url: "", cta_type: "" });
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [variations, setVariations] = useState<string[]>([]);
  const [media, setMedia] = useState<Attachment[]>([]);

  const [schedule, setSchedule] = useState({ date: "", time: "", platform: "", publisherId: "" });
  const [reminderOffsets, setReminderOffsets] = useState<string[]>(["24h", "1h", "15m", "due"]);
  const [reminderChannels, setReminderChannels] = useState<string[]>(["dashboard", "email"]);

  const fileRef = useRef<HTMLInputElement>(null);
  const sourceFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/content-hub/meta", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setPublishers(d.publishers || []);
          if (d.settings?.reminder_offsets) setReminderOffsets(d.settings.reminder_offsets);
          if (d.settings?.reminder_channels) setReminderChannels(d.settings.reminder_channels);
        }
      })
      .catch(() => {});
  }, []);

  const publisherName = useMemo(
    () => publishers.find((p) => p.id === schedule.publisherId)?.full_name || "",
    [publishers, schedule.publisherId],
  );

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  async function callAI(action: string, payload: Record<string, unknown>) {
    setAiBusy(action);
    try {
      const res = await fetch("/api/admin/content-hub/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "AI request failed.");
      return json.result;
    } catch (e) {
      await appAlert({ title: "AI", message: e instanceof Error ? e.message : "AI request failed.", kind: "error" });
      return null;
    } finally {
      setAiBusy(null);
    }
  }

  async function uploadFile(file: File): Promise<Attachment | null> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/content-hub/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      await appAlert({ title: "Upload", message: json.error || "Upload failed.", kind: "error" });
      return null;
    }
    return { url: json.url, kind: json.kind || mediaKindFromMime(file.type), file_name: json.file_name, mime_type: json.mime_type, size_bytes: json.size_bytes };
  }

  // ── Step 1 generators ──
  async function runGenerate() {
    const text = await callAI("generate", brief);
    if (text) { setBodyText(text); if (!title) setTitle(brief.topic.slice(0, 80)); setStep(1); }
  }
  async function runFromImage() {
    if (!sourceMedia) return appAlert({ title: "Image", message: "Upload an image first.", kind: "error" });
    const text = await callAI("from_image", { imageUrl: sourceMedia.url, note: sourceNote, platform: brief.platform });
    if (text) { setBodyText(text); setMedia((m) => [...m, sourceMedia]); setStep(1); }
  }
  async function runFromVideo() {
    if (!sourceMedia) return appAlert({ title: "Video", message: "Upload a video first.", kind: "error" });
    const text = await callAI("from_video", { videoUrl: sourceMedia.url, note: sourceNote, platform: brief.platform });
    if (text) { setBodyText(text); setMedia((m) => [...m, sourceMedia]); setStep(1); }
  }

  // ── Step 3 AI enhancement ──
  async function enhance(kind: string) {
    const text = await callAI("enhance", { kind, content: bodyText });
    if (text) setBodyText(text);
  }
  async function tone(t: string) {
    const text = await callAI("tone", { tone: t, content: bodyText });
    if (text) setBodyText(text);
  }
  async function genHashtags() {
    const tags = await callAI("hashtags", { content: bodyText });
    if (Array.isArray(tags)) setHashtags(tags);
  }
  async function genVariations() {
    const v = await callAI("variations", { content: bodyText, count: 3 });
    if (Array.isArray(v)) setVariations(v);
  }
  async function genCta(kind?: string) {
    const text = await callAI("cta", { content: bodyText, kind });
    if (text) setCta((c) => ({ ...c, cta_label: String(text).replace(/^["']|["']$/g, "") }));
  }

  async function submit(status: "draft" | "pending" | "approved" | "scheduled") {
    if (title.trim().length < 2) { setStep(1); return appAlert({ title: "Title", message: "Add a title first.", kind: "error" }); }
    let scheduledAt: string | null = null;
    if (status === "scheduled") {
      if (!schedule.date || !schedule.time) { setStep(5); return appAlert({ title: "Schedule", message: "Pick a date and time.", kind: "error" }); }
      scheduledAt = new Date(`${schedule.date}T${schedule.time}`).toISOString();
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/content-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, body: bodyText, source, category, content_type: contentType, platforms,
          cta_label: cta.cta_label, cta_url: cta.cta_url, cta_type: cta.cta_type, hashtags,
          status, scheduled_at: scheduledAt, scheduled_platform: schedule.platform,
          assigned_publisher_id: schedule.publisherId || null, assigned_publisher_name: publisherName || null,
          media, reminder_offsets: reminderOffsets, reminder_channels: reminderChannels,
          ai_meta: { variations },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not save.");
      await appAlert({ title: "Saved", message: `Content saved as ${status}.`, kind: "success" });
      router.push(status === "scheduled" ? "/admin/content-hub/calendar" : "/admin/content-hub/library");
    } catch (e) {
      await appAlert({ title: "Save failed", message: e instanceof Error ? e.message : "Could not save.", kind: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ContentHubShell title="Create Content" subtitle="A guided flow: source → details → AI polish → CTA → media → schedule → approval.">
      {/* Stepper */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <button
                type="button"
                onClick={() => i <= step && setStep(i)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-bold transition ${
                  i === step ? "bg-[#0A4FE8] text-white" : i < step ? "bg-blue-50 text-[#0A4FE8]" : "bg-gray-100 text-gray-400"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${i === step ? "bg-white/20" : i < step ? "bg-[#0A4FE8] text-white" : "bg-white"}`}>
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && <span className="mx-0.5 h-px w-4 bg-gray-200 sm:w-6" />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
          {/* STEP 1 - SOURCE */}
          {step === 0 && (
            <Step title="How do you want to create this content?">
              <div className="grid gap-3 sm:grid-cols-2">
                <SourceCard active={source === "manual"} icon={PenLine} label="Create Manually" desc="Write the content yourself." onClick={() => setSource("manual")} />
                <SourceCard active={source === "ai"} icon={Sparkles} label="Generate with AI" desc="Topic, audience, platform, tone." onClick={() => setSource("ai")} />
                <SourceCard active={source === "image"} icon={ImageIcon} label="Generate From Image" desc="Upload a design / flyer." onClick={() => setSource("image")} />
                <SourceCard active={source === "video"} icon={Video} label="Generate From Video" desc="Upload a reel / event footage." onClick={() => setSource("video")} />
              </div>

              {source === "manual" && (
                <p className="mt-5 rounded-xl bg-blue-50/60 px-4 py-3 text-[13px] text-[#0D1B39]">
                  You&apos;ll write the content in the next step. Click <b>Next</b> to continue.
                </p>
              )}

              {source === "ai" && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Input label="Topic" value={brief.topic} onChange={(v) => setBrief({ ...brief, topic: v })} placeholder="e.g. Why brand consistency wins" full />
                  <Input label="Audience" value={brief.audience} onChange={(v) => setBrief({ ...brief, audience: v })} placeholder="Founders, SMEs..." />
                  <Select label="Platform" value={brief.platform} onChange={(v) => setBrief({ ...brief, platform: v })} options={[{ value: "", label: "Any" }, ...PLATFORMS]} />
                  <Select label="Tone" value={brief.tone} onChange={(v) => setBrief({ ...brief, tone: v })} options={TONES.map((t) => ({ value: t.value, label: t.label }))} />
                  <Input label="Objective" value={brief.objective} onChange={(v) => setBrief({ ...brief, objective: v })} placeholder="Leads, awareness, hiring..." full />
                  <div className="sm:col-span-2">
                    <AiButton onClick={runGenerate} busy={aiBusy === "generate"} label="Generate content" />
                  </div>
                </div>
              )}

              {(source === "image" || source === "video") && (
                <div className="mt-5 space-y-3">
                  <input
                    ref={sourceFileRef}
                    type="file"
                    accept={source === "image" ? "image/*" : "video/*"}
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]; if (!f) return;
                      setAiBusy("upload");
                      const att = await uploadFile(f); setAiBusy(null);
                      if (att) setSourceMedia(att);
                    }}
                  />
                  <button type="button" onClick={() => sourceFileRef.current?.click()} className="flex h-32 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-[13px] font-semibold text-gray-500 transition hover:border-blue-300 hover:bg-blue-50/40">
                    {aiBusy === "upload" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                    {sourceMedia ? "Replace file" : `Upload ${source}`}
                  </button>
                  {sourceMedia && (
                    <div className="flex items-center gap-3 rounded-xl border border-gray-100 p-2">
                      {sourceMedia.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={sourceMedia.url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                      ) : <Video className="h-10 w-10 text-gray-400" />}
                      <span className="truncate text-[12.5px] text-gray-600">{sourceMedia.file_name}</span>
                    </div>
                  )}
                  <Input label="Context (optional)" value={sourceNote} onChange={setSourceNote} placeholder="What is this about?" full />
                  <AiButton onClick={source === "image" ? runFromImage : runFromVideo} busy={aiBusy === "from_image" || aiBusy === "from_video"} label={`Generate from ${source}`} />
                </div>
              )}
            </Step>
          )}

          {/* STEP 2 - DETAILS */}
          {step === 1 && (
            <Step title="Content details">
              <div className="grid gap-3">
                <Input label="Title" value={title} onChange={setTitle} placeholder="Internal title for this content" full />
                <Textarea label="Content / Caption" value={bodyText} onChange={setBodyText} rows={8} placeholder="Write or paste the content people will see..." />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select label="Category" value={category} onChange={setCategory} options={[{ value: "", label: "Choose..." }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} />
                  <Select label="Content Type" value={contentType} onChange={setContentType} options={CONTENT_TYPES.map((c) => ({ value: c, label: c }))} />
                </div>
                <div>
                  <Label>Platforms</Label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((p) => (
                      <Chip key={p.value} active={platforms.includes(p.value)} onClick={() => setPlatforms(toggle(platforms, p.value))}>{p.label}</Chip>
                    ))}
                  </div>
                </div>
              </div>
            </Step>
          )}

          {/* STEP 3 - AI ENHANCE */}
          {step === 2 && (
            <Step title="Polish with AI">
              <Textarea label="Content" value={bodyText} onChange={setBodyText} rows={8} />
              <div className="mt-3 flex flex-wrap gap-2">
                {ENHANCE_ACTIONS.map((a) => (
                  <AiChip key={a.value} busy={aiBusy === "enhance"} onClick={() => enhance(a.value)}>{a.label}</AiChip>
                ))}
              </div>
              <Label>Tone</Label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <AiChip key={t.value} busy={aiBusy === "tone"} onClick={() => tone(t.value)}>{t.label}</AiChip>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <AiChip busy={aiBusy === "hashtags"} onClick={genHashtags}><Hash className="h-3.5 w-3.5" /> Generate Hashtags</AiChip>
                <AiChip busy={aiBusy === "cta"} onClick={() => genCta()}><Megaphone className="h-3.5 w-3.5" /> Generate CTA</AiChip>
                <AiChip busy={aiBusy === "variations"} onClick={genVariations}><Wand2 className="h-3.5 w-3.5" /> Generate Variations</AiChip>
              </div>
              {hashtags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 rounded-xl bg-gray-50 p-3">
                  {hashtags.map((h) => <span key={h} className="text-[12px] font-medium text-[#0A4FE8]">{h}</span>)}
                </div>
              )}
              {variations.length > 0 && (
                <div className="mt-3 space-y-2">
                  <Label>Variations - click to use</Label>
                  {variations.map((v, i) => (
                    <button key={i} type="button" onClick={() => setBodyText(v)} className="block w-full rounded-xl border border-gray-100 bg-white p-3 text-left text-[12.5px] text-[#0D1B39] transition hover:border-blue-200 hover:bg-blue-50/40">
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </Step>
          )}

          {/* STEP 4 - CTA */}
          {step === 3 && (
            <Step title="Call to action">
              <div className="grid gap-2 sm:grid-cols-2">
                {CTA_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setCta({ cta_label: preset.cta_label, cta_url: cta.cta_url, cta_type: preset.cta_type })}
                    className={`rounded-xl border p-3 text-left transition ${cta.cta_type === preset.cta_type ? "border-[#0A4FE8] bg-blue-50 ring-2 ring-blue-100" : "border-gray-200 hover:border-blue-200 hover:bg-blue-50/40"}`}
                  >
                    <p className="text-[13px] font-bold text-[#0D1B39]">{preset.label}</p>
                    <p className="text-[12px] text-gray-500">{preset.cta_label || "Write your own"}</p>
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input label="CTA text" value={cta.cta_label} onChange={(v) => setCta({ ...cta, cta_label: v })} placeholder="Book a Consultation" full />
                <Input label="CTA link (optional)" value={cta.cta_url} onChange={(v) => setCta({ ...cta, cta_url: v })} placeholder="https://cdsspace.pro/Contact" full />
              </div>
              <div className="mt-3"><AiChip busy={aiBusy === "cta"} onClick={() => genCta(cta.cta_type)}><Sparkles className="h-3.5 w-3.5" /> Suggest a CTA with AI</AiChip></div>
            </Step>
          )}

          {/* STEP 5 - MEDIA */}
          {step === 4 && (
            <Step title="Attach media">
              <input ref={fileRef} type="file" multiple accept="image/*,video/*,application/pdf,.doc,.docx" className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []); if (!files.length) return;
                  setAiBusy("upload");
                  for (const f of files) { const att = await uploadFile(f); if (att) setMedia((m) => [...m, att]); }
                  setAiBusy(null);
                }}
              />
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-32 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-[13px] font-semibold text-gray-500 transition hover:border-blue-300 hover:bg-blue-50/40">
                {aiBusy === "upload" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                Upload images, videos, PDFs or documents
              </button>
              {media.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {media.map((m, i) => (
                    <div key={i} className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                      {m.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt="" className="h-full w-full object-cover" />
                      ) : m.kind === "video" ? <Video className="h-7 w-7 text-gray-400" /> : <FileText className="h-7 w-7 text-gray-400" />}
                      <button type="button" onClick={() => setMedia(media.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Step>
          )}

          {/* STEP 6 - SCHEDULE */}
          {step === 5 && (
            <Step title="Schedule & assign">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Date" type="date" value={schedule.date} onChange={(v) => setSchedule({ ...schedule, date: v })} />
                <Input label="Time" type="time" value={schedule.time} onChange={(v) => setSchedule({ ...schedule, time: v })} />
                <Select label="Primary platform" value={schedule.platform} onChange={(v) => setSchedule({ ...schedule, platform: v })} options={[{ value: "", label: "Choose..." }, ...PLATFORMS]} />
                <Select label="Assigned publisher (CRP / Social Media Mgr)" value={schedule.publisherId} onChange={(v) => setSchedule({ ...schedule, publisherId: v })}
                  options={[{ value: "", label: "Choose..." }, ...publishers.map((p) => ({ value: p.id, label: `${p.full_name}${p.role_title ? ` · ${p.role_title}` : ""}` }))]} />
              </div>
              <div className="mt-4">
                <Label>Reminders</Label>
                <div className="flex flex-wrap gap-2">
                  {REMINDER_OFFSETS.map((o) => (
                    <Chip key={o.value} active={reminderOffsets.includes(o.value)} onClick={() => setReminderOffsets(toggle(reminderOffsets, o.value))}>{o.label}</Chip>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <Label>Reminder channels</Label>
                <div className="flex flex-wrap gap-2">
                  {REMINDER_CHANNELS.map((c) => (
                    <Chip key={c.value} active={reminderChannels.includes(c.value)} onClick={() => setReminderChannels(toggle(reminderChannels, c.value))}>{c.label}</Chip>
                  ))}
                </div>
              </div>
            </Step>
          )}

          {/* STEP 7 - APPROVAL */}
          {step === 6 && (
            <Step title="Review & save">
              <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4 text-[13px]">
                <Row label="Title" value={title || "-"} />
                <Row label="Type" value={`${contentType}${category ? ` · ${category}` : ""}`} />
                <Row label="Platforms" value={platforms.length ? platforms.join(", ") : "-"} />
                <Row label="CTA" value={cta.cta_label || "-"} />
                <Row label="Media" value={`${media.length} file(s)`} />
                <Row label="Schedule" value={schedule.date && schedule.time ? `${schedule.date} ${schedule.time}` : "Not scheduled"} />
                <Row label="Publisher" value={publisherName || "-"} />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <FinishButton onClick={() => submit("draft")} busy={submitting} icon={FileText} label="Save as Draft" variant="ghost" />
                <FinishButton onClick={() => submit("pending")} busy={submitting} icon={ShieldCheck} label="Submit for Approval" variant="outline" />
                <FinishButton onClick={() => submit("approved")} busy={submitting} icon={Check} label="Approve" variant="outline" />
                <FinishButton onClick={() => submit("scheduled")} busy={submitting} icon={CalendarClock} label="Approve & Schedule" variant="primary" />
              </div>
            </Step>
          )}

          {/* Nav buttons */}
          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
            <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-gray-500 transition hover:bg-gray-50 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            {step < STEPS.length - 1 && (
              <button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A4FE8] px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#083EC0]">
                Next <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>

        {/* Live preview */}
        <aside className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5 h-fit">
          <h3 className="text-[14px] font-bold text-[#0D1B39]">Live preview</h3>
          <p className="text-[12px] text-gray-500">How the caption reads when packaged.</p>
          <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="text-[12px] font-bold text-[#0D1B39]">{title || "Untitled"}</p>
            <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-6 text-[#0D1B39]">
              {[bodyText, cta.cta_label, hashtags.join(" ")].filter(Boolean).join("\n\n") || "Nothing yet."}
            </pre>
          </div>
          {media.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {media.slice(0, 6).map((m, i) => (
                <div key={i} className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                  {m.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" className="h-full w-full object-cover" />
                  ) : <Video className="h-5 w-5 text-gray-400" />}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </ContentHubShell>
  );
}

// ── small building blocks ──
function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div><h2 className="mb-4 text-[16px] font-bold text-[#0D1B39]">{title}</h2>{children}</div>);
}
function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wider text-gray-400">{children}</p>;
}
function Row({ label, value }: { label: string; value: string }) {
  return (<div className="flex justify-between gap-3"><span className="text-gray-500">{label}</span><span className="font-semibold text-[#0D1B39] text-right">{value}</span></div>);
}
function Input({ label, value, onChange, placeholder, type = "text", full }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-[12px] font-bold text-[#0D1B39]">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13.5px] text-[#0D1B39] outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
    </label>
  );
}
function Textarea({ label, value, onChange, rows = 6, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-bold text-[#0D1B39]">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13.5px] leading-6 text-[#0D1B39] outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
    </label>
  );
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-bold text-[#0D1B39]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13.5px] font-medium text-[#0D1B39] outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${active ? "bg-[#0A4FE8] text-white" : "bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-[#0A4FE8]"}`}>
      {active && <Check className="h-3 w-3" />}{children}
    </button>
  );
}
function AiChip({ busy, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" disabled={busy} onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-[12px] font-semibold text-[#0A4FE8] transition hover:bg-blue-100 disabled:opacity-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{children}
    </button>
  );
}
function AiButton({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[13.5px] font-bold text-white transition hover:bg-[#083EC0] disabled:opacity-60">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{label}
    </button>
  );
}
function SourceCard({ active, icon: Icon, label, desc, onClick }: { active: boolean; icon: LucideIcon; label: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${active ? "border-[#0A4FE8] bg-blue-50 ring-2 ring-blue-100" : "border-gray-200 hover:border-blue-200 hover:bg-blue-50/40"}`}>
      <Icon className={`h-5 w-5 ${active ? "text-[#0A4FE8]" : "text-gray-400"}`} />
      <p className="mt-2 text-[14px] font-bold text-[#0D1B39]">{label}</p>
      <p className="text-[12px] text-gray-500">{desc}</p>
    </button>
  );
}
function FinishButton({ onClick, busy, icon: Icon, label, variant }: { onClick: () => void; busy: boolean; icon: LucideIcon; label: string; variant: "primary" | "outline" | "ghost" }) {
  const cls = variant === "primary"
    ? "bg-[#0A4FE8] text-white hover:bg-[#083EC0]"
    : variant === "outline"
      ? "border border-gray-200 text-[#0D1B39] hover:border-blue-200 hover:bg-blue-50"
      : "text-gray-600 hover:bg-gray-50";
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-bold transition disabled:opacity-60 ${cls}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{label}
    </button>
  );
}
