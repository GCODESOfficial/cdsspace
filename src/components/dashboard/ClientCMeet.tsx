"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Headphones, Loader2, Video } from "lucide-react";
import { MeetingModeModal, type MeetingRequest } from "@/components/chat/MeetingModeModal";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { appAlert } from "@/lib/app-notify";
import { buildCMeetAutoJoinPath, buildCMeetPath } from "@/lib/cmeet-links";

type Meeting = {
  id: string;
  room_code: string;
  title: string;
  audio_only: boolean;
  scheduled_for: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  created_at: string;
  link: string;
};

function joinPath(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  try {
    const url = new URL(clean, "https://cdsspace.pro");
    const match = url.pathname.match(/^\/meet\/([^/]+)/);
    if (match?.[1]) return `/meet/${encodeURIComponent(decodeURIComponent(match[1]))}`;
  } catch { /* use the entered room code below */ }
  const code = clean.replace(/^.*\/meet\//, "").split(/[/?#]/)[0].replace(/[^a-z0-9-]/gi, "");
  return code ? `/meet/${encodeURIComponent(code)}` : "";
}

export function ClientCMeet() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<"voice" | "video" | null>(null);
  const [joinValue, setJoinValue] = useState("");
  const destination = useMemo(() => joinPath(joinValue), [joinValue]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/client/cmeet", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load meetings.");
      setMeetings(payload.meetings || []);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not load meetings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(request: MeetingRequest) {
    setCreating(true);
    try {
      const response = await fetch("/api/client/cmeet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: request.title,
          audio_only: request.audioOnly,
          scheduled_for: request.scheduledFor,
          agenda_items: request.agendaItems,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not create the meeting.");
      setMeetings((current) => [payload.meeting, ...current]);
      setKind(null);
      if (!request.scheduledFor) {
        const meetingPath = payload.meeting?.link || buildCMeetPath(payload.meeting?.room_code, request.title);
        router.push(buildCMeetAutoJoinPath(meetingPath));
      }
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not create the meeting.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1450px] space-y-6 p-3 sm:p-5 lg:p-8">
      <header className="overflow-hidden rounded-[28px] bg-[#0A4FE8] p-6 text-white shadow-[0_22px_60px_rgba(10,79,232,.18)] sm:p-8">
        <div className="max-w-3xl">
          <div>
            <p className="text-xs font-semibold text-blue-100">CDS Space calls</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">cMeet</h1>
            <p className="mt-2 max-w-xl text-sm leading-5 text-blue-100">Start an audio or video room immediately, with no admin approval required.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:max-w-lg sm:grid-cols-2">
            <button onClick={() => setKind("voice")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/30 px-5 text-sm font-semibold hover:bg-white/10"><Headphones className="h-4 w-4" />Audio cMeet</button>
            <button onClick={() => setKind("video")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#0A4FE8]"><Video className="h-4 w-4" />Video cMeet</button>
          </div>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-[24px] border border-[#DDE5F4] bg-white p-6 shadow-sm">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><Video className="h-5 w-5" /></span>
          <h2 className="mt-5 text-xl font-semibold text-[#07113F]">Join a meeting</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">Paste a cMeet link or enter its room code.</p>
          <input value={joinValue} onChange={(event) => setJoinValue(event.target.value)} placeholder="Meeting link or room code" className="mt-5 h-12 w-full rounded-xl border border-[#DDE5F4] px-4 text-sm outline-none focus:border-[#0A4FE8] focus:ring-4 focus:ring-blue-100" />
          {destination ? <Link href={destination} className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#0A4FE8] text-sm font-semibold text-white">Join cMeet</Link> : <span className="mt-3 grid h-12 place-items-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-400">Enter a meeting code</span>}
        </div>

        <div className="rounded-[24px] border border-[#DDE5F4] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold text-[#07113F]">Your meetings</h2><p className="mt-1 text-xs text-slate-500">Rooms you created from cMeet or Chat.</p></div><CalendarClock className="h-5 w-5 text-[#0A4FE8]" /></div>
          {loading ? <div className="grid min-h-56 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div> : meetings.length === 0 ? <div className="grid min-h-56 place-items-center text-center"><div><p className="text-sm font-semibold text-[#07113F]">No meetings yet</p><p className="mt-1 text-xs text-slate-500">Create your first instant or scheduled cMeet.</p></div></div> : <div className="mt-5 space-y-3">{meetings.map((meeting) => <article key={meeting.id} className="flex flex-col gap-4 rounded-2xl border border-[#E1E7F2] p-4 sm:flex-row sm:items-center"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]">{meeting.audio_only ? <Headphones className="h-4 w-4" /> : <Video className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-[#07113F]">{meeting.title}</h3><p className="mt-1 text-[11px] text-slate-500">{meeting.scheduled_for ? new Date(meeting.scheduled_for).toLocaleString() : meeting.status === "live" ? "Live now" : meeting.status.replaceAll("_", " ")}</p></div><div className="flex gap-2"><UniversalShareButton title={meeting.title} text={`Join my cMeet: ${meeting.title}`} url={meeting.link} label="Share" className="min-h-10 px-3" /><Link href={meeting.link} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#0A4FE8] px-4 text-xs font-semibold text-white">{meeting.status === "ended" ? "View" : "Join"}</Link></div></article>)}</div>}
        </div>
      </section>

      <MeetingModeModal open={Boolean(kind)} kind={kind || "video"} defaultTitle="Client meeting" busy={creating} onSubmit={create} onClose={() => { if (!creating) setKind(null); }} />
    </div>
  );
}
