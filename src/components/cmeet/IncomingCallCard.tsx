"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Loader2, Phone, PhoneOff, Users, Video } from "lucide-react";

/**
 * The incoming-call screen shared by the web ringers (team / admin:
 * components/team/IncomingCallRinger, client: components/dashboard/
 * ClientIncomingCallRinger), matching the app's: who is calling, one-to-one or
 * group, voice or video, and round Decline / Accept (Join for a group) buttons.
 * `children` sit under the buttons (ringtone, admin redirect / reschedule).
 */

export type IncomingCallView = {
  id: string;
  roomCode: string;
  title: string;
  audioOnly: boolean;
  callerName: string;
  callerAvatar?: string | null;
  link: string;
  group?: boolean;
  participantCount?: number;
};

// "Voice call - Design team" (how chat calls are titled) -> "Design team".
const CALL_TITLE_PREFIX = new RegExp(`^(voice|video|audio)\\s+(call|meeting)\\s*[-–${String.fromCharCode(0x2014)}:]\\s*`, "i");
const groupName = (title: string) =>
  String(title || "").replace(CALL_TITLE_PREFIX, "").trim() || "Group call";

const initials = (name: string) =>
  String(name || "?")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

export function IncomingCallCard({
  call,
  more = 0,
  declining = false,
  onDecline,
  onAccept,
  children,
}: {
  call: IncomingCallView;
  more?: number;
  declining?: boolean;
  onDecline: () => void;
  onAccept: () => void;
  children?: ReactNode;
}) {
  const group = Boolean(call.group);
  const kind = call.audioOnly ? "voice" : "video";
  const name = group ? groupName(call.title) : call.callerName || "CDS Space";
  const label = group ? `Group ${kind} call` : `Incoming ${kind} call`;
  const count = Number(call.participantCount) || 0;
  const detail = group ? `${call.callerName || "Someone"} is calling${count > 2 ? ` · ${count} people` : ""}` : "is calling you…";
  const topic = !group && call.title && !/^(voice|video|audio)\s+(call|meeting)\b/i.test(call.title) ? call.title : null;

  return (
    <div className="fixed inset-0 z-[140] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-live="assertive"
        aria-label={group ? `Incoming group ${kind} call, ${name}, from ${call.callerName}` : `Incoming ${kind} call from ${name}`}
        className="w-full max-w-sm overflow-hidden rounded-[28px] bg-[#040B37] px-6 pb-7 pt-6 text-center text-white shadow-2xl"
      >
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C9D4F5]">
          {call.audioOnly ? <Phone className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
          CDS Space · {label}
        </p>

        <div className="relative mx-auto mt-9 grid h-28 w-28 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#0A4FE8]/40" aria-hidden="true" />
          <span className="absolute -inset-3 animate-pulse rounded-full bg-[#0A4FE8]/15" aria-hidden="true" />
          <span className="relative grid h-28 w-28 place-items-center rounded-full bg-[#0A4FE8] text-4xl font-semibold">
            {group ? (
              <Users className="h-12 w-12" />
            ) : call.callerAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={call.callerAvatar} alt="" className="h-28 w-28 rounded-full object-cover" />
            ) : (
              initials(name)
            )}
          </span>
        </div>

        <h2 className="mt-8 text-2xl font-semibold leading-tight">{name}</h2>
        <p className="mt-2 text-sm text-[#C9D4F5]">{detail}</p>
        {topic && <p className="mt-1 text-xs leading-5 text-[#8E9BC7]">{topic}</p>}
        {more > 0 && <p className="mt-3 text-xs font-medium text-[#8E9BC7]">{more} more incoming call{more === 1 ? "" : "s"}</p>}

        <div className="mt-9 flex items-start justify-around">
          <div className="flex w-28 flex-col items-center">
            <button
              type="button"
              onClick={onDecline}
              disabled={declining}
              aria-label="Decline call"
              className="grid h-16 w-16 place-items-center rounded-full bg-[#E5484D] transition hover:brightness-110 disabled:opacity-70"
            >
              {declining ? <Loader2 className="h-6 w-6 animate-spin" /> : <PhoneOff className="h-7 w-7" />}
            </button>
            <span className="mt-2.5 text-sm font-medium">Decline</span>
          </div>
          <div className="flex w-28 flex-col items-center">
            <Link
              href={call.link}
              onClick={onAccept}
              aria-label={group ? "Join call" : "Accept call"}
              className="grid h-16 w-16 place-items-center rounded-full bg-[#22C55E] transition hover:brightness-110"
            >
              {call.audioOnly ? <Phone className="h-7 w-7" /> : <Video className="h-7 w-7" />}
            </Link>
            <span className="mt-2.5 text-sm font-medium">{group ? "Join" : "Accept"}</span>
          </div>
        </div>

        {children ? <div className="mt-6 text-left">{children}</div> : null}
      </section>
    </div>
  );
}

/** Tells the server this person declined (stops it ringing on all their devices; the caller sees it). */
export async function declineIncomingCall(roomCode: string) {
  await fetch(`/api/cmeet/${encodeURIComponent(roomCode)}/decline`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => undefined);
}
