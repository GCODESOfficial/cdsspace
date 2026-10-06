"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, ListChecks, Loader2, Video, X } from "lucide-react";
import { normalizeCMeetAgendaItems } from "@/lib/cmeet-agenda";

/**
 * The one place a meeting is started from a conversation.
 *
 * Every chat surface - team, client and admin - used to create a room the
 * instant the call button was pressed, so there was no way to set one up for
 * later from the conversation it belongs to. The choice now always comes first,
 * and it is the same choice wherever it is made, which is why this lives in one
 * component rather than three.
 */

export type MeetingMode = "instant" | "scheduled";

export interface MeetingRequest {
  mode: MeetingMode;
  title: string;
  /** ISO timestamp, null for an instant meeting. */
  scheduledFor: string | null;
  audioOnly: boolean;
  agendaItems: string[];
}

/** A local datetime the browser will accept in a `datetime-local` input. */
function defaultSlot() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setMinutes(start.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (start.getMinutes() === 0) start.setHours(start.getHours() + 1);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
}

export function MeetingModeModal({
  open,
  kind,
  defaultTitle,
  busy = false,
  requiresApproval = false,
  onSubmit,
  onClose,
}: {
  open: boolean;
  /** Which button was pressed, so a voice call stays a voice call. */
  kind: "voice" | "video";
  defaultTitle: string;
  busy?: boolean;
  /** Non-admin creators submit a request; they cannot open the room themselves. */
  requiresApproval?: boolean;
  onSubmit: (request: MeetingRequest) => void | Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<MeetingMode | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [slot, setSlot] = useState(defaultSlot);
  const [agenda, setAgenda] = useState("");
  const [error, setError] = useState("");

  // Every opening starts from the choice, with the title the conversation
  // suggests, so a previous attempt never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setMode(null);
    setTitle(defaultTitle);
    setSlot(defaultSlot());
    setAgenda("");
    setError("");
  }, [open, defaultTitle]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const minSlot = useMemo(() => defaultSlot(), []);

  if (!open) return null;

  const submit = async () => {
    if (!mode) return;
    const topic = title.trim();
    if (!topic) { setError("Give the meeting a topic so everyone knows what it is for."); return; }
    if (mode === "scheduled") {
      const when = new Date(slot);
      if (!Number.isFinite(when.getTime())) { setError("Choose a date and time."); return; }
      if (when.getTime() <= Date.now()) { setError("Choose a date and time in the future."); return; }
      setError("");
      await onSubmit({ mode, title: topic, scheduledFor: when.toISOString(), audioOnly: kind === "voice", agendaItems: requiresApproval ? [] : normalizeCMeetAgendaItems(agenda) });
      return;
    }
    setError("");
    await onSubmit({ mode, title: topic, scheduledFor: null, audioOnly: kind === "voice", agendaItems: requiresApproval ? [] : normalizeCMeetAgendaItems(agenda) });
  };

  return (
    <div
      className="fixed inset-0 layer-modal flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create a meeting"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {mode && (
              <button
                type="button"
                onClick={() => { setMode(null); setError(""); }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-[#0A4FE8]"
                aria-label="Back to meeting type"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h3 className="text-[15px] font-semibold text-[#0D1B39]">
                {mode === "instant" ? "Instant meeting" : mode === "scheduled" ? "Schedule a meeting" : "Create a meeting"}
              </h3>
              {!mode && <p className="mt-0.5 text-[10.5px] text-gray-400">How would you like to meet?</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 hover:bg-gray-50 disabled:opacity-50" aria-label="Close">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!mode ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("instant")}
                className="group rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-[#0A4FE8] hover:bg-[#0A4FE8]/[0.03]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0A4FE8] text-white"><Video className="h-[18px] w-[18px]" /></span>
                <span className="mt-3 block text-[13px] font-semibold text-[#0D1B39]">Instant meeting</span>
                <span className="mt-1 block text-[11px] leading-4 text-gray-400">{requiresApproval ? "Request a room for an admin to approve." : "Create the room and join the call immediately."}</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("scheduled")}
                className="group rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-[#0A4FE8] hover:bg-[#0A4FE8]/[0.03]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0A4FE8]/10 text-[#0A4FE8]"><CalendarClock className="h-[18px] w-[18px]" /></span>
                <span className="mt-3 block text-[13px] font-semibold text-[#0D1B39]">Schedule for later</span>
                <span className="mt-1 block text-[11px] leading-4 text-gray-400">Choose a future date and prepare the invite link now.</span>
              </button>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium text-gray-500">Meeting topic</span>
                <input
                  autoFocus
                  maxLength={120}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What is this meeting about?"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] outline-none focus:border-[#0A4FE8]"
                />
              </label>

              {mode === "scheduled" && (
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium text-gray-500">When</span>
                  <input
                    type="datetime-local"
                    value={slot}
                    min={minSlot}
                    onChange={(event) => setSlot(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] outline-none focus:border-[#0A4FE8]"
                  />
                </label>
              )}

              {!requiresApproval && <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                  <ListChecks className="h-3.5 w-3.5" /> Meeting agenda (optional)
                </span>
                <textarea
                  value={agenda}
                  onChange={(event) => setAgenda(event.target.value)}
                  rows={4}
                  placeholder={"Add one discussion item per line\nProject update\nNext steps"}
                  className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] leading-5 outline-none focus:border-[#0A4FE8]"
                />
                <span className="mt-1 block text-[10px] text-gray-400">Each line becomes an item participants can move to Discussed.</span>
              </label>}

              <p className="rounded-xl bg-[#0A4FE8]/[0.05] px-3 py-2.5 text-[11px] leading-4 text-[#0D1B39]">
                {mode === "instant"
                  ? requiresApproval
                    ? `The room is prepared now and opens after admin approval${kind === "voice" ? " as a voice call" : ""}.`
                    : `The room opens now and the join link is posted into this conversation${kind === "voice" ? " as a voice call" : ""}.`
                  : `The room is reserved for the time you pick${requiresApproval ? " and sent to an admin for approval" : ""}${kind === "voice" ? ". It opens as a voice call" : ""}.`}
              </p>

              {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
            </>
          )}
        </div>

        {mode && (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-4 py-2.5 text-[13px] font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#0843c4] disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {requiresApproval ? "Request meeting" : mode === "instant" ? "Start now" : "Schedule meeting"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
