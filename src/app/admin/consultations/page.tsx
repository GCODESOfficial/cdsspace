'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Mail, Phone, Building2, DollarSign, MessageSquare, Paperclip, Trash2, Search, Video, Copy, Check, ExternalLink, Loader2, CalendarClock, MapPin, MessageCircle, Send, Clock, FileText } from "lucide-react";
import { appConfirm } from "@/lib/app-notify";
import { toast } from "sonner";

type MeetingType = "none" | "cmeet" | "zoom" | "google_meet" | "other";

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
  meeting_type?: MeetingType | null;
  meeting_link?: string | null;
  whatsapp?: string | null;
  location?: string | null;
  topics?: string[] | null;
  preferred_days?: string[] | null;
  preferred_times?: string[] | null;
  email_sent_at?: string | null;
  // Set when the request came from the Kickoff Meet button on a proposal link.
  proposal_id?: string | null;
  proposal?: { id: string; title: string | null; brand_name: string | null; public_token: string } | null;
  created_at: string;
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fullMeetingUrl(link: string | null | undefined) {
  if (!link) return "";
  if (/^https?:\/\//i.test(link)) return link;
  if (typeof window !== "undefined") return `${window.location.origin}${link}`;
  return link;
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

  // Meeting scheduling (local edit state for the open request)
  const [meet, setMeet] = useState<{ scheduled_at: string; meeting_type: MeetingType; meeting_link: string }>({ scheduled_at: "", meeting_type: "none", meeting_link: "" });
  const [savingMeet, setSavingMeet] = useState(false);
  const [genning, setGenning] = useState(false);
  const [copied, setCopied] = useState(false);

  // Email composer (review before send)
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (active) {
      setMeet({
        scheduled_at: toLocalInput(active.scheduled_at),
        meeting_type: (active.meeting_type as MeetingType) || "none",
        meeting_link: active.meeting_link || "",
      });
      setCopied(false);
      setEmailOpen(false);
    }
  }, [active]);

  const openComposer = () => {
    if (!active) return;
    setEmailSubject("Your CDS Space consultation");
    setEmailBody(defaultEmailBody(active));
    setEmailOpen(true);
  };

  const sendEmail = async () => {
    if (!active) return;
    if (!emailSubject.trim() || !emailBody.trim()) { toast.error("Add a subject and a message."); return; }
    setSendingEmail(true);
    const r = await fetch(`/api/admin/consultations/${active.id}/send-email`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: emailSubject, body: emailBody }),
    });
    const d = await r.json().catch(() => ({}));
    setSendingEmail(false);
    if (!r.ok) { toast.error(d.error || "Could not send the email."); return; }
    if (d.consultation) setActive(d.consultation);
    setEmailOpen(false);
    load();
    toast.success(`Email sent to ${active.email}`);
  };

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
    if (!(await appConfirm("Delete this consultation request?"))) return;
    await fetch(`/api/admin/consultations/${id}`, { method: "DELETE" });
    setActive(null); load();
  };

  const patchActive = async (id: string, patch: Record<string, unknown>): Promise<Consultation | null> => {
    const r = await fetch(`/api/admin/consultations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || "Failed"); return null; }
    return d.consultation as Consultation;
  };

  const saveMeeting = async () => {
    if (!active) return;
    const scheduledIso = meet.scheduled_at ? new Date(meet.scheduled_at).toISOString() : null;
    if (meet.meeting_type !== "none" && meet.meeting_type !== "cmeet" && !meet.meeting_link.trim()) {
      toast.error("Paste the meeting link (Zoom / Google Meet / other).");
      return;
    }
    setSavingMeet(true);
    const updated = await patchActive(active.id, {
      scheduled_at: scheduledIso,
      meeting_type: meet.meeting_type,
      meeting_link: meet.meeting_type === "none" ? null : meet.meeting_link.trim() || null,
    });
    setSavingMeet(false);
    if (updated) { setActive(updated); load(); toast.success("Meeting saved"); }
  };

  const generateCmeet = async () => {
    if (!active) return;
    const scheduledIso = meet.scheduled_at ? new Date(meet.scheduled_at).toISOString() : null;
    setGenning(true);
    const updated = await patchActive(active.id, { generate_cmeet: true, scheduled_at: scheduledIso });
    setGenning(false);
    if (updated) {
      setActive(updated);
      setMeet((m) => ({ ...m, meeting_type: "cmeet", meeting_link: updated.meeting_link || "" }));
      load();
      toast.success("cMeet link created");
    }
  };

  const copyLink = () => {
    const url = fullMeetingUrl(active?.meeting_link);
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
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
    <div className="p-8 min-h-screen bg-[#F5F8FF]">
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
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize whitespace-nowrap transition ${filter === s ? "bg-[#0A4FE8] text-white shadow-lg shadow-blue-600/30" : "text-gray-600 hover:bg-white/70"}`}
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
                  <th className="px-5 py-4">Submitted</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-white/60 hover:bg-white/50 transition cursor-pointer" onClick={() => setActive(c)}>
                    <td className="px-5 py-4 font-semibold text-gray-900">
                      {c.full_name}
                      {c.proposal_id && (
                        <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 ring-1 ring-blue-100">Kickoff</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-600">{c.email}</td>
                    <td className="px-5 py-4 text-gray-500">{c.company ?? "-"}</td>
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
                {active.proposal && (
                  <Link
                    href={`/admin/deals/proposals?proposal=${active.proposal.id}`}
                    className="flex items-center gap-2.5 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm font-semibold text-blue-800 transition hover:border-blue-300"
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      Kickoff meet booked from proposal: {active.proposal.title || active.proposal.brand_name}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </Link>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Info icon={Mail} label="Email">{active.email}</Info>
                  {active.whatsapp && <Info icon={MessageCircle} label="WhatsApp">{active.whatsapp}</Info>}
                  {active.location && <Info icon={MapPin} label="Location">{active.location}</Info>}
                  {active.company && <Info icon={Building2} label="Company">{active.company}</Info>}
                  {active.budget_range && <Info icon={DollarSign} label="Budget">{active.budget_range}</Info>}
                  {active.how_heard && <Info icon={Phone} label="Heard via">{active.how_heard}</Info>}
                </div>

                {active.topics && active.topics.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
                      <MessageSquare className="w-3.5 h-3.5" /> Topics
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {active.topics.map((t) => (
                        <span key={t} className="rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100 px-2.5 py-1 text-[11px] font-semibold">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {((active.preferred_days && active.preferred_days.length > 0) || (active.preferred_times && active.preferred_times.length > 0)) && (
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
                      <Clock className="w-3.5 h-3.5" /> Preferred meeting window
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[...(active.preferred_days || []), ...(active.preferred_times || [])].map((w) => (
                        <span key={w} className="rounded-full bg-white text-gray-700 ring-1 ring-gray-200 px-2.5 py-1 text-[11px] font-medium">{w}</span>
                      ))}
                    </div>
                  </div>
                )}

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

                {/* Schedule a meeting */}
                <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-violet-700 font-semibold">
                    <CalendarClock className="w-3.5 h-3.5" /> Schedule a meeting
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-gray-500">Date &amp; time</label>
                      <input
                        type="datetime-local"
                        value={meet.scheduled_at}
                        onChange={(e) => setMeet({ ...meet, scheduled_at: e.target.value })}
                        className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-violet-400"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-gray-500">Platform</label>
                      <Select value={meet.meeting_type} onValueChange={(v) => setMeet({ ...meet, meeting_type: v as MeetingType })}>
                        <SelectTrigger className="h-11 rounded-xl mt-1.5 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No meeting yet</SelectItem>
                          <SelectItem value="cmeet">cMeet (built-in)</SelectItem>
                          <SelectItem value="zoom">Zoom</SelectItem>
                          <SelectItem value="google_meet">Google Meet</SelectItem>
                          <SelectItem value="other">Other link</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {meet.meeting_type === "cmeet" && (
                    <div>
                      <button
                        type="button"
                        onClick={generateCmeet}
                        disabled={genning}
                        className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                      >
                        {genning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                        {active.meeting_link && active.meeting_type === "cmeet" ? "Regenerate cMeet link" : "Generate cMeet link"}
                      </button>
                      <p className="mt-1.5 text-[11px] text-gray-500">Creates a scheduled cMeet room now so you can share the link ahead of the meeting date.</p>
                    </div>
                  )}

                  {(meet.meeting_type === "zoom" || meet.meeting_type === "google_meet" || meet.meeting_type === "other") && (
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-gray-500">
                        {meet.meeting_type === "zoom" ? "Zoom link" : meet.meeting_type === "google_meet" ? "Google Meet link" : "Meeting link"}
                      </label>
                      <input
                        type="url"
                        value={meet.meeting_link}
                        onChange={(e) => setMeet({ ...meet, meeting_link: e.target.value })}
                        placeholder="https://…"
                        className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-violet-400"
                      />
                    </div>
                  )}

                  {/* Current saved link */}
                  {active.meeting_link && (
                    <div className="flex items-center gap-2 rounded-lg bg-white border border-violet-100 px-3 py-2">
                      <Video className="w-4 h-4 text-violet-600 shrink-0" />
                      <span className="flex-1 truncate text-[13px] text-gray-700">{fullMeetingUrl(active.meeting_link)}</span>
                      <button type="button" onClick={copyLink} className="p-1.5 rounded-md hover:bg-gray-100" title="Copy link">
                        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
                      </button>
                      <a href={fullMeetingUrl(active.meeting_link)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md hover:bg-gray-100" title="Open">
                        <ExternalLink className="w-4 h-4 text-gray-500" />
                      </a>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={saveMeeting}
                    disabled={savingMeet}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60"
                  >
                    {savingMeet ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} Save meeting
                  </button>
                </div>

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

                {/* Email: review before send */}
                {emailOpen && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-blue-700 font-semibold">
                      <Mail className="w-3.5 h-3.5" /> Review email to {active.email}
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-gray-500">Subject</label>
                      <input
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-gray-500">Message</label>
                      <Textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        className="rounded-xl mt-1.5 min-h-[160px] bg-white"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEmailOpen(false)}
                        className="inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={sendEmail}
                        disabled={sendingEmail}
                        className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-[#0A4FE8] px-5 text-sm font-medium text-white shadow-lg shadow-blue-600/30 transition hover:bg-[#083FC2] disabled:opacity-60"
                      >
                        {sendingEmail ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Send className="h-4 w-4 shrink-0" />}
                        Send email
                      </button>
                    </div>
                  </div>
                )}

                {/* Wraps instead of compressing: at narrow widths the labels used
                    to break mid-word and the buttons lost their fixed height. */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => remove(active.id)}
                    className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-red-200 px-4 text-sm font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    Delete
                  </button>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {active.email_sent_at && (
                      <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-3 text-[11px] font-medium text-emerald-700">
                        <Check className="h-3 w-3 shrink-0" />
                        Sent {new Date(active.email_sent_at).toLocaleDateString()}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={openComposer}
                      className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-[#0A4FE8] px-5 text-sm font-medium text-white shadow-lg shadow-blue-600/30 transition hover:bg-[#083FC2]"
                    >
                      <Mail className="h-4 w-4 shrink-0" />
                      {active.email_sent_at ? "Send another email" : "Compose email"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function defaultEmailBody(c: Consultation) {
  const lines = [`Hi ${c.full_name.split(" ")[0]},`, "", "Thank you for reaching out to CDS Space."];
  if (c.scheduled_at) {
    lines.push("", `Your consultation is scheduled for ${new Date(c.scheduled_at).toLocaleString()}.`);
  }
  if (c.meeting_link) {
    lines.push(`Join here: ${fullMeetingUrl(c.meeting_link)}`);
  }
  lines.push("", "Looking forward to speaking with you.", "", "Warm regards,", "CDS Space");
  return lines.join("\n");
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
