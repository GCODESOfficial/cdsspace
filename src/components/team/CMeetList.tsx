"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Phone, Plus, Loader2, Copy, X as XIcon, Trash2, Clock, Search, Check, Archive, ArchiveRestore } from "lucide-react";
import { appAlert, appConfirm } from "@/lib/app-notify";

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
}

interface Member { id: string; full_name: string; email: string; avatar_url: string | null }

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
  const upcoming = meetings.filter((m) => m.scheduled_for && !m.started_at && new Date(m.scheduled_for).getTime() > now && m.ended_at === null);
  const recent = meetings.filter((m) => !upcoming.includes(m));

  async function terminate(m: Meeting) {
    if (!(await appConfirm(`End meeting "${m.title}"?`))) return;
    await fetch(`/api/cmeet/${m.room_code}`, { method: "DELETE" });
    fetchMeetings();
  }

  function copyLink(m: Meeting) {
    navigator.clipboard.writeText(`${window.location.origin}/meet/${m.room_code}`);
  }

  function join(code: string) {
    router.push(`/meet/${code.trim()}`);
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
          <button
            onClick={() => canJoinByCode && join(joinCode)}
            disabled={!canJoinByCode}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-[12px] font-medium transition disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
          >
            Join
          </button>
        </div>
      </div>

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
                  onJoin={() => join(m.room_code)}
                  onCopy={() => copyLink(m)}
                  onTerminate={() => terminate(m)}
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
                  onJoin={() => join(m.room_code)}
                  onCopy={() => copyLink(m)}
                  onTerminate={() => terminate(m)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={(m) => { setShowCreate(false); fetchMeetings(); join(m.room_code); }} />}
    </div>
  );
}

function MeetingRow({
  m,
  selected,
  onToggleSelect,
  onJoin,
  onCopy,
  onTerminate,
}: {
  m: Meeting;
  selected: boolean;
  onToggleSelect: () => void;
  onJoin: () => void;
  onCopy: () => void;
  onTerminate: () => void;
}) {
  const isLive = m.started_at && !m.ended_at;
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
        <button onClick={onCopy} className="inline-flex flex-1 sm:flex-none items-center justify-center p-2.5 rounded-xl text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50" title="Copy link"><Copy className="w-4 h-4" /></button>
        {!m.ended_at && (
          <button onClick={onJoin} className="inline-flex flex-1 sm:flex-none items-center justify-center px-4 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-[11.5px] font-medium">Join</button>
        )}
        <button onClick={onTerminate} className="inline-flex flex-1 sm:flex-none items-center justify-center p-2.5 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50" title="Terminate"><Trash2 className="w-4 h-4" /></button>
      </div>
    </li>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (m: Meeting) => void }) {
  const [title, setTitle] = useState("");
  const [audioOnly, setAudioOnly] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitees, setInvitees] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/team-members").then((r) => r.json()).then((j) => { if (j.ok) setMembers(j.members); });
  }, []);

  async function submit() {
    setSaving(true);
    const scheduled_for = schedule && date && time ? new Date(`${date}T${time}`).toISOString() : null;
    const r = await fetch("/api/cmeet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, audio_only: audioOnly, scheduled_for, invited_member_ids: Array.from(invitees) }),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok || !j.ok) { appAlert(j.error || "Couldn't create"); return; }
    onCreated(j.meeting);
  }

  const filtered = members.filter((m) =>
    [m.full_name, m.email].some((v) => (v || "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[#0D1B39]">New meeting</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50"><XIcon className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly sync" className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]" />
          </div>
          <div className="flex items-center gap-4 text-[12.5px]">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)} className="w-4 h-4" />
              Audio only (voice call)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="w-4 h-4" />
              Schedule for later
            </label>
          </div>
          {schedule && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]" />
            </div>
          )}
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
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <button onClick={submit} disabled={saving} className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-[13px] font-medium hover:bg-[#083EC0] disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {schedule ? "Schedule" : "Start now"}
          </button>
          <button onClick={onClose} className="w-full sm:w-auto px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
