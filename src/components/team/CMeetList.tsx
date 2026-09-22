"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, Phone, Plus, Loader2, X as XIcon, Trash2, Clock, Search, Archive, ArchiveRestore, CalendarClock, ArrowLeft, Check, XCircle, ListChecks } from "lucide-react";
import { appAlert, appConfirm } from "@/lib/app-notify";
import { buildCMeetAutoJoinPath, buildCMeetPath, CMEET_TOPIC_SUGGESTIONS } from "@/lib/cmeet-links";
import { DraftRecoveryBanner, useDraftRecovery } from "@/lib/use-draft-recovery";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { normalizeCMeetAgendaItems } from "@/lib/cmeet-agenda";

interface Meeting {
  id: string;
  room_code: string;
  title: string;
  created_by: string | null;
  created_by_admin: boolean;
  started_at: string | null;
  ended_at: string | null;
  scheduled_for: string | null;
  audio_only: boolean;
  archived_at: string | null;
  created_at: string;
  status: string;
  approval_status: "pending" | "approved" | "rejected";
}

interface Member { id: string; full_name: string; email: string; avatar_url: string | null }

function localDateMin() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function CMeetList({ variant = "team" }: { variant?: "team" | "admin" }) {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"archive" | "unarchive" | "delete" | null>(null);

  async function fetchMeetings() {
    setLoading(true);
    const r = await fetch(`/api/cmeet?archived=${showArchived}`, { cache: "no-store" });
    const j = await r.json();
    if (j.ok) setMeetings(j.meetings);
    setLoading(false);
  }
  useEffect(() => {
    fetchMeetings();
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const now = Date.now();
  const pending = meetings.filter((m) => m.approval_status === "pending" || m.status === "pending_approval");
  const upcoming = meetings.filter((m) => !pending.includes(m) && m.scheduled_for && !m.started_at && new Date(m.scheduled_for).getTime() > now && m.ended_at === null);
  const recent = meetings.filter((m) => !pending.includes(m) && !upcoming.includes(m));

  async function terminate(m: Meeting) {
    if (!(await appConfirm(`End meeting "${m.title}"?`))) return;
    await fetch(`/api/cmeet/${m.room_code}`, { method: "DELETE" });
    fetchMeetings();
  }

  async function decideApproval(m: Meeting, decision: "approve" | "reject") {
    if (decision === "reject" && !(await appConfirm(`Decline meeting request "${m.title}"?`))) return;
    const response = await fetch(`/api/cmeet/${encodeURIComponent(m.room_code)}/approval`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      await appAlert(payload.error || "The meeting request could not be updated.");
      return;
    }
    await fetchMeetings();
  }

  const canJoinByCode = joinCode.trim().length > 0;

  function toggleSelect(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAllVisible(scope: Meeting[]) {
    setSelected((prev) => {
      const allOn = scope.length > 0 && scope.every((m) => prev.has(m.id));
      const next = new Set(prev);
      if (allOn) scope.forEach((m) => next.delete(m.id));
      else scope.forEach((m) => next.add(m.id));
      return next;
    });
  }

  async function runBulk(action: "archive" | "unarchive" | "delete") {
    if (selected.size === 0) return;
    if (action === "delete") {
      const ok = await appConfirm(
        `Permanently delete ${selected.size} meeting${selected.size === 1 ? "" : "s"}? This can't be undone.`
      );
      if (!ok) return;
    }
    setBulkBusy(action);
    try {
      if (action === "delete") {
        await fetch("/api/cmeet", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: Array.from(selected) }),
        });
      } else {
        await fetch("/api/cmeet", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: Array.from(selected), action }),
        });
      }
      setSelected(new Set());
      fetchMeetings();
    } finally {
      setBulkBusy(null);
    }
  }

  return (
    <div className="max-w-[1200px] px-0 py-1 md:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          {variant === "admin" && <p className="text-[#0A4FE8] text-sm font-semibold">Workspace</p>}
          <h1 className="text-[26px] font-bold text-[#0D1B39] tracking-tight">cMeet</h1>
          <p className="text-gray-400 text-[13px] mt-1">Video calls, screen-sharing, in-call chat. Full-mesh peer-to-peer.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex w-full md:w-auto items-center justify-center gap-2 px-5 py-3 bg-[#0A4FE8] text-white text-[13px] font-medium rounded-2xl hover:bg-[#083EC0]">
          <Plus className="w-4 h-4" /> New meeting
        </button>
      </div>

      {/* Join-by-code card */}
      <div className="mb-6 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 sm:px-5 py-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Video className="w-5 h-5 text-[#0A4FE8]" />
        <div className="flex-1">
          <p className="text-[12.5px] font-semibold text-[#0D1B39]">Join with a code</p>
          <p className="text-[10.5px] text-gray-400">Paste a room code sent to you</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[18rem] sm:flex-row">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="e.g. quick-bird-42" className="w-full flex-1 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[12.5px]" />
          <Link
            href={canJoinByCode ? buildCMeetPath(joinCode.trim()) : "#"}
            target={canJoinByCode ? "_blank" : undefined}
            rel={canJoinByCode ? "noopener noreferrer" : undefined}
            aria-disabled={!canJoinByCode}
            onClick={(event) => { if (!canJoinByCode) event.preventDefault(); }}
            className={`w-full rounded-xl px-4 py-2.5 text-center text-[12px] font-medium transition sm:w-auto ${canJoinByCode ? "bg-[#0A4FE8] text-white" : "cursor-not-allowed bg-gray-200 text-gray-400"}`}
          >
            Join
          </Link>
        </div>
      </div>

      {pending.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[12px] font-semibold text-amber-700">Awaiting admin approval</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{pending.length}</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
            <ul className="divide-y divide-amber-100">
              {pending.map((m) => (
                <MeetingRow
                  key={m.id}
                  m={m}
                  selected={selected.has(m.id)}
                  onToggleSelect={() => toggleSelect(m.id)}
                  joinHref={buildCMeetPath(m.room_code, m.title)}
                  onTerminate={() => terminate(m)}
                  isAdmin={variant === "admin"}
                  onApprove={() => decideApproval(m, "approve")}
                  onReject={() => decideApproval(m, "reject")}
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mb-6">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-gray-500 mb-2">Scheduled</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-50">
              {upcoming.map((m) => (
                <MeetingRow
                  key={m.id}
                  m={m}
                  selected={selected.has(m.id)}
                  onToggleSelect={() => toggleSelect(m.id)}
                  joinHref={buildCMeetPath(m.room_code, m.title)}
                  onTerminate={() => terminate(m)}
                  isAdmin={variant === "admin"}
                  onApprove={() => decideApproval(m, "approve")}
                  onReject={() => decideApproval(m, "reject")}
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {recent.length > 0 && (
              <input
                type="checkbox"
                checked={recent.length > 0 && recent.every((m) => selected.has(m.id))}
                onChange={() => selectAllVisible(recent)}
                className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer"
                title="Select all"
              />
            )}
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-gray-500">
              {showArchived ? "Archived" : "Recent"}
            </h2>
          </div>
          <button
            onClick={() => setShowArchived((s) => !s)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium border transition ${
              showArchived
                ? "bg-[#0D1B39] text-white border-[#0D1B39]"
                : "bg-white text-gray-500 border-gray-200 hover:text-[#0A4FE8] hover:border-[#0A4FE8]/40"
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        </div>

        {selected.size > 0 && (
          <div className="mb-3 rounded-xl bg-[#0A4FE8]/5 border border-[#0A4FE8]/20 px-4 py-3 flex flex-wrap items-center gap-3 text-[12.5px]">
            <span className="font-semibold text-[#0A4FE8]">
              {selected.size} selected
            </span>
            {!showArchived ? (
              <button
                onClick={() => runBulk("archive")}
                disabled={bulkBusy !== null}
                className="inline-flex items-center gap-1.5 text-gray-600 hover:text-[#0A4FE8] disabled:opacity-50"
              >
                {bulkBusy === "archive" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                Archive
              </button>
            ) : (
              <button
                onClick={() => runBulk("unarchive")}
                disabled={bulkBusy !== null}
                className="inline-flex items-center gap-1.5 text-gray-600 hover:text-[#0A4FE8] disabled:opacity-50"
              >
                {bulkBusy === "unarchive" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArchiveRestore className="w-3.5 h-3.5" />}
                Restore
              </button>
            )}
            <button
              onClick={() => runBulk("delete")}
              disabled={bulkBusy !== null}
              className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700 disabled:opacity-50"
            >
              {bulkBusy === "delete" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-gray-400 hover:text-gray-600 sm:ml-auto"
            >
              Clear
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-14 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" /></div>
          ) : recent.length === 0 ? (
            <div className="py-14 text-center text-[13px] text-gray-400">
              {showArchived ? "No archived meetings." : "No meetings yet."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recent.map((m) => (
                <MeetingRow
                  key={m.id}
                  m={m}
                  selected={selected.has(m.id)}
                  onToggleSelect={() => toggleSelect(m.id)}
                  joinHref={buildCMeetPath(m.room_code, m.title)}
                  onTerminate={() => terminate(m)}
                  isAdmin={variant === "admin"}
                  onApprove={() => decideApproval(m, "approve")}
                  onReject={() => decideApproval(m, "reject")}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {showCreate && <CreateModal requiresApproval={false} onClose={() => setShowCreate(false)} onCreated={(m) => {
        setShowCreate(false);
        fetchMeetings();
        if (m.approval_status === "pending") {
          void appAlert("Your cMeet request was sent. An admin must approve it before the call can start.");
        } else if (!m.scheduled_for) {
          router.push(buildCMeetAutoJoinPath(buildCMeetPath(m.room_code, m.title)));
        }
      }} />}
    </div>
  );
}

function MeetingRow({
  m,
  selected,
  onToggleSelect,
  joinHref,
  onTerminate,
  isAdmin,
  onApprove,
  onReject,
}: {
  m: Meeting;
  selected: boolean;
  onToggleSelect: () => void;
  joinHref: string;
  onTerminate: () => void;
  isAdmin: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isLive = m.started_at && !m.ended_at;
  const isPending = m.approval_status === "pending" || m.status === "pending_approval";
  return (
    <li className={`px-4 sm:px-5 py-4 flex flex-col gap-3 transition sm:flex-row sm:items-center ${selected ? "bg-[#0A4FE8]/5" : ""}`}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer shrink-0"
        />
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isLive ? "bg-emerald-100 text-emerald-700" : "bg-[#0A4FE8]/10 text-[#0A4FE8]"}`}>
          {m.audio_only ? <Phone className="w-4 h-4" /> : <Video className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13.5px] font-semibold text-[#0D1B39] truncate">{m.title}</p>
            {isLive && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white uppercase">Live</span>}
            {isPending && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700">Awaiting approval</span>}
            {m.ended_at && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">Ended</span>}
            {m.archived_at && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">Archived</span>}
          </div>
          <p className="text-[11px] text-gray-400 flex flex-wrap items-center gap-2 mt-1">
            <Clock className="w-3 h-3" />
            {m.scheduled_for ? new Date(m.scheduled_for).toLocaleString() : new Date(m.created_at).toLocaleString()}
            <span className="font-mono break-all">{m.room_code}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:shrink-0">
        {!isPending && <UniversalShareButton
          title={m.title}
          text={`Join ${m.scheduled_for ? "the scheduled" : "the live"} meeting "${m.title}" on CDS Space cMeet.`}
          url={buildCMeetPath(m.room_code, m.title)}
          label=""
          className="min-h-9 flex-1 rounded-xl p-2.5 text-gray-400 shadow-none hover:text-[#0A4FE8] sm:flex-none"
        />}
        {isPending && isAdmin ? (
          <>
            <button onClick={onReject} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2.5 text-[11.5px] font-medium text-rose-600 sm:flex-none"><XCircle className="h-4 w-4" /> Decline</button>
            <button onClick={onApprove} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0A4FE8] px-3 py-2.5 text-[11.5px] font-medium text-white sm:flex-none"><Check className="h-4 w-4" /> Approve</button>
          </>
        ) : !m.ended_at && !isPending ? (
          <Link href={joinHref} target="_blank" rel="noopener noreferrer" className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[11.5px] font-medium text-white sm:flex-none">Join</Link>
        ) : isPending ? <span className="px-2 text-[11px] text-amber-700">Admin review required</span> : null}
        <button onClick={onTerminate} className="inline-flex flex-1 sm:flex-none items-center justify-center p-2.5 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50" title="Terminate"><Trash2 className="w-4 h-4" /></button>
      </div>
    </li>
  );
}

function CreateModal({ onClose, onCreated, requiresApproval }: { onClose: () => void; onCreated: (m: Meeting) => void; requiresApproval: boolean }) {
  const [mode, setMode] = useState<"instant" | "scheduled" | null>(null);
  const [title, setTitle] = useState("");
  const [audioOnly, setAudioOnly] = useState(false);
  const [agenda, setAgenda] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitees, setInvitees] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const draft = useDraftRecovery<{
    mode?: "instant" | "scheduled" | null;
    title: string;
    audioOnly: boolean;
    schedule?: boolean;
    date: string;
    time: string;
    invitees: string[];
    agenda?: string;
  }>("cmeet-new-meeting");

  useEffect(() => {
    fetch("/api/admin/team-members").then((r) => r.json()).then((j) => { if (j.ok) setMembers(j.members); });
  }, []);

  useEffect(() => {
    draft.save({ mode, title, audioOnly, schedule: mode === "scheduled", date, time, invitees: Array.from(invitees), agenda });
    // Draft callbacks are stable; state values are the intended save triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, title, audioOnly, date, time, invitees, agenda]);

  async function submit() {
    if (!mode) {
      await appAlert("Choose whether to start now or schedule for later.");
      return;
    }
    if (!title.trim()) {
      await appAlert("Enter a meeting topic before continuing.");
      return;
    }
    if (mode === "scheduled" && (!date || !time)) {
      await appAlert("Choose both a date and time for the meeting.");
      return;
    }
    const scheduledDate = mode === "scheduled" ? new Date(`${date}T${time}`) : null;
    if (scheduledDate && (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now())) {
      await appAlert("Choose a future date and time for the meeting.");
      return;
    }
    setSaving(true);
    const scheduled_for = scheduledDate?.toISOString() || null;
    const r = await fetch("/api/cmeet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, audio_only: audioOnly, scheduled_for, invited_member_ids: Array.from(invitees), agenda_items: requiresApproval ? [] : normalizeCMeetAgendaItems(agenda) }),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok || !j.ok) { appAlert(j.error || "Couldn't create"); return; }
    draft.clear();
    onCreated(j.meeting);
  }

  const filtered = members.filter((m) =>
    [m.full_name, m.email].some((v) => (v || "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            {mode && (
              <button type="button" onClick={() => setMode(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-[#0A4FE8]" aria-label="Back to meeting type">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h3 className="text-[15px] font-semibold text-[#0D1B39]">{mode === "instant" ? "Instant meeting" : mode === "scheduled" ? "Schedule a meeting" : "Create a meeting"}</h3>
              {!mode && <p className="mt-0.5 text-[10.5px] text-gray-400">How would you like to meet?</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50"><XIcon className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <DraftRecoveryBanner
            draft={draft}
            label="meeting draft"
            onRestore={(saved) => {
              setMode(saved.mode || (saved.schedule ? "scheduled" : "instant"));
              setTitle(saved.title || "");
              setAudioOnly(Boolean(saved.audioOnly));
              setDate(saved.date || "");
              setTime(saved.time || "");
              setInvitees(new Set(Array.isArray(saved.invitees) ? saved.invitees : []));
              setAgenda(saved.agenda || "");
            }}
          />
          {!mode ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("instant")}
                className="group rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-[#0A4FE8] hover:bg-[#0A4FE8]/[0.03]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0A4FE8] text-white"><Video className="h-4.5 w-4.5" /></span>
                <span className="mt-3 block text-[13px] font-semibold text-[#0D1B39]">Instant meeting</span>
                <span className="mt-1 block text-[11px] leading-4 text-gray-400">{requiresApproval ? "Request a room for an admin to approve." : "Create the room and join the call immediately."}</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("scheduled")}
                className="group rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-[#0A4FE8] hover:bg-[#0A4FE8]/[0.03]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0A4FE8]/10 text-[#0A4FE8]"><CalendarClock className="h-4.5 w-4.5" /></span>
                <span className="mt-3 block text-[13px] font-semibold text-[#0D1B39]">Schedule for later</span>
                <span className="mt-1 block text-[11px] leading-4 text-gray-400">Choose a future date and prepare the invite link now.</span>
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Meeting topic</label>
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What is this meeting about?"
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]"
                />
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested meeting topics">
                  {CMEET_TOPIC_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setTitle(suggestion)}
                      className={`rounded-full border px-2.5 py-1 text-[10.5px] transition ${
                        title === suggestion
                          ? "border-[#0A4FE8] bg-[#0A4FE8]/10 text-[#0A4FE8]"
                          : "border-gray-200 bg-white text-gray-500 hover:border-[#0A4FE8]/40 hover:text-[#0A4FE8]"
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-gray-400">Your meeting topic will appear in the invite link and link-preview image. Draft changes save automatically.</p>
              </div>
              {mode === "scheduled" && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-gray-500">Meeting date and time</label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input type="date" min={localDateMin()} value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]" />
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]" />
                  </div>
                </div>
              )}
              {!requiresApproval && <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-gray-500"><ListChecks className="h-3.5 w-3.5" /> Meeting agenda (optional)</label>
                <textarea
                  value={agenda}
                  onChange={(event) => setAgenda(event.target.value)}
                  rows={4}
                  placeholder={"Add one discussion item per line\nProject update\nNext steps"}
                  className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] leading-5"
                />
                <p className="mt-1 text-[10px] text-gray-400">Each line becomes an item participants can move to Discussed.</p>
              </div>}
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)} className="w-4 h-4" />
                Audio only (voice call)
              </label>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Invite team members</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[12.5px]" />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100">
                  {filtered.map((m) => {
                    const checked = invitees.has(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => {
                          const next = new Set(invitees);
                          if (checked) next.delete(m.id); else next.add(m.id);
                          setInvitees(next);
                        }} className="w-4 h-4" />
                        <span className="text-[12.5px] text-[#0D1B39]">{m.full_name}</span>
                        <span className="text-[10.5px] text-gray-400 ml-auto">{m.email}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        {mode && (
          <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <button onClick={submit} disabled={saving || !title.trim() || (mode === "scheduled" && (!date || !time))} className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-[13px] font-medium hover:bg-[#083EC0] disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "scheduled" ? <CalendarClock className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              {requiresApproval ? "Request meeting" : mode === "scheduled" ? "Schedule meeting" : "Start meeting"}
            </button>
            <button onClick={onClose} className="w-full sm:w-auto px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
