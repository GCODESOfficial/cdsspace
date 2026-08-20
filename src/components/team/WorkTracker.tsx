"use client";

/**
 * Persistent work-focus companion.
 *
 * This deliberately does not request screen sharing, create a video element,
 * take screenshots or infer "idle" from a quiet browser tab. A work session is
 * linked to Timebook attendance and stays alive through navigation/reloads.
 * The member supplies the task, activity category and focus note; lightweight
 * heartbeats preserve that evidence for the admin activity timeline.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Code2,
  FileText,
  Loader2,
  MessageSquare,
  Palette,
  Presentation,
  Settings2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const HEARTBEAT_MS = 60_000;

const FOCUS_CATEGORIES = [
  { value: "productive_work", label: "General work", icon: BriefcaseBusiness },
  { value: "design", label: "Design", icon: Palette },
  { value: "development", label: "Development", icon: Code2 },
  { value: "content", label: "Content", icon: FileText },
  { value: "meeting", label: "Meeting", icon: Presentation },
  { value: "learning", label: "Research & study", icon: BookOpen },
  { value: "communication", label: "Communication", icon: MessageSquare },
  { value: "project_management", label: "Planning", icon: BriefcaseBusiness },
  { value: "administration", label: "Administration", icon: Settings2 },
] as const;

type FocusTask = {
  id: string;
  title: string;
  board_title: string;
  list_title: string;
};

type TrackingSession = {
  id: string;
  status: "active" | "paused" | "stopped";
  metadata?: {
    focus_category?: string;
    focus_detail?: string;
    task_id?: string;
    task_title?: string;
  };
};

export function WorkTracker() {
  const [session, setSession] = useState<TrackingSession | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<FocusTask[]>([]);
  const [category, setCategory] = useState("productive_work");
  const [taskId, setTaskId] = useState("");
  const [detail, setDetail] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const lastInteractionAt = useRef(Date.now());
  const sessionRef = useRef<TrackingSession | null>(null);
  const contextRef = useRef({ category: "productive_work", taskId: "", detail: "" });
  const tasksRef = useRef<FocusTask[]>([]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    contextRef.current = { category, taskId, detail };
  }, [category, detail, taskId]);

  const loadFocusTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/taskboard?portal=team&focus=1", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.ok) setTasks(json.tasks || []);
    } catch {
      setTasks([]);
    }
  }, []);

  const startSession = useCallback(async () => {
    const res = await fetch("/api/team/work-tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "start_session" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) return null;
    const active = json.session as TrackingSession;
    setSession(active);
    sessionRef.current = active;
    return active;
  }, []);

  const heartbeat = useCallback(async (forceCheckpoint = false) => {
    const active = sessionRef.current;
    if (!active || active.status !== "active") return;
    const context = contextRef.current;
    const task = tasksRef.current.find((item) => item.id === context.taskId);
    try {
      const res = await fetch("/api/team/work-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: forceCheckpoint ? "set_context" : "heartbeat",
          session_id: active.id,
          focus_category: context.category,
          focus_detail: context.detail,
          task_id: task?.id || null,
          task_title: task?.title || null,
          board_title: task?.board_title || null,
          page_path: window.location.pathname,
          page_title: document.title,
          last_interaction_at: new Date(lastInteractionAt.current).toISOString(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        if (json.attendance_state === "checked_out" || json.attendance_state === "not_checked_in") {
          setClockedIn(false);
        }
        sessionRef.current = null;
        setSession(null);
        return;
      }
      if (res.ok && json.ok) {
        if (json.session) {
          sessionRef.current = json.session;
          setSession(json.session);
        }
        setLastSavedAt(new Date().toISOString());
      }
    } catch {
      // The session remains server-side; the next heartbeat retries.
    }
  }, []);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/team/work-tracking", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) return;
      const checkedIn = !!json.today?.clock_in_at && !json.today?.clock_out_at;
      setClockedIn(checkedIn);
      let active = json.active_session as TrackingSession | null;
      if (active?.metadata) {
        const restoredContext = {
          category: active.metadata.focus_category || "productive_work",
          detail: active.metadata.focus_detail || "",
          taskId: active.metadata.task_id || "",
        };
        contextRef.current = restoredContext;
        setCategory(restoredContext.category);
        setDetail(restoredContext.detail);
        setTaskId(restoredContext.taskId);
      }
      if (checkedIn && !active) active = await startSession();
      setSession(active);
      sessionRef.current = active;
    } catch {
      // Attendance/work tracking may not be configured yet.
    }
  }, [startSession]);

  useEffect(() => {
    void loadFocusTasks();
    void loadState();
  }, [loadFocusTasks, loadState]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void loadState();
    };
    const syncOtherTab = (event: StorageEvent) => {
      if (event.key === "cds:attendance-sync") void loadState();
    };
    const timer = window.setInterval(refresh, HEARTBEAT_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", syncOtherTab);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", syncOtherTab);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadState]);

  useEffect(() => {
    const bump = () => {
      lastInteractionAt.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, bump, { passive: true }));
    return () => events.forEach((event) => window.removeEventListener(event, bump));
  }, []);

  useEffect(() => {
    if (!clockedIn || session?.status !== "active") return;
    const timer = window.setInterval(() => void heartbeat(), HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [clockedIn, heartbeat, session?.status]);

  useEffect(() => {
    const onClockedIn = () => {
      setClockedIn(true);
      void startSession().then((active) => {
        if (active) void heartbeat(true);
      });
    };
    const onClockedOut = () => {
      const active = sessionRef.current;
      setClockedIn(false);
      setExpanded(false);
      if (active) {
        void fetch("/api/team/work-tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "stop_session", session_id: active.id, reason: "clocked_out" }),
        });
      }
      setSession(null);
      sessionRef.current = null;
    };
    window.addEventListener("cds:clocked-in", onClockedIn);
    window.addEventListener("cds:clocked-out", onClockedOut);
    return () => {
      window.removeEventListener("cds:clocked-in", onClockedIn);
      window.removeEventListener("cds:clocked-out", onClockedOut);
    };
  }, [heartbeat, startSession]);

  async function saveFocus() {
    if (!detail.trim() && !taskId) {
      toast.error("Choose a task or describe what you are working on.");
      return;
    }
    setBusy(true);
    try {
      let active = sessionRef.current;
      if (!active) active = await startSession();
      if (!active) throw new Error("Check in before starting a work focus.");
      if (active.status === "paused") {
        const res = await fetch("/api/team/work-tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resume_session", session_id: active.id }),
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          active = json.session;
          setSession(active);
          sessionRef.current = active;
        }
      }
      await heartbeat(true);
      setExpanded(false);
      toast.success("Work focus updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update focus.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    const active = sessionRef.current;
    if (!active) return;
    setBusy(true);
    try {
      const nextAction = active.status === "paused" ? "resume_session" : "pause_session";
      const res = await fetch("/api/team/work-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: nextAction,
          session_id: active.id,
          reason: nextAction === "pause_session" ? "member_pause" : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not update session.");
      setSession(json.session);
      sessionRef.current = json.session;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update session.");
    } finally {
      setBusy(false);
    }
  }

  if (!clockedIn || !session) return null;

  const selectedCategory = FOCUS_CATEGORIES.find((item) => item.value === category) || FOCUS_CATEGORIES[0];
  const SelectedIcon = selectedCategory.icon;
  const selectedTask = tasks.find((task) => task.id === taskId);

  return (
    <div className="fixed bottom-4 right-4 z-[70] sm:bottom-6 sm:right-6">
      {expanded && (
        <div className="mb-2 w-[min(92vw,390px)] overflow-hidden rounded-[22px] border border-white/80 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-[#040B37] px-4 py-4 text-white">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200">Work focus</p>
              <h2 className="mt-1 text-[16px] font-bold">What are you working on?</h2>
              <p className="mt-1 text-[10.5px] text-white/60">This creates a clear activity timeline, with no screen sharing.</p>
            </div>
            <button type="button" onClick={() => setExpanded(false)} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close work focus">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-4">
            <div>
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Activity</span>
              <div className="grid grid-cols-2 gap-2">
                {FOCUS_CATEGORIES.map((item) => (
                  <button key={item.value} type="button" onClick={() => setCategory(item.value)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[11.5px] font-semibold transition ${
                      category === item.value
                        ? "border-[#0A4FE8] bg-blue-50 text-[#0A4FE8]"
                        : "border-slate-100 text-slate-600 hover:border-blue-100"
                    }`}>
                    <item.icon className="h-3.5 w-3.5" /> {item.label}
                  </button>
                ))}
              </div>
            </div>

            <label>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Taskboard task</span>
              <select value={taskId} onChange={(event) => {
                setTaskId(event.target.value);
                const task = tasks.find((item) => item.id === event.target.value);
                if (task && !detail.trim()) setDetail(task.title);
              }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] text-[#0D1B39] outline-none focus:border-blue-300">
                <option value="">No linked task</option>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.title} · {task.board_title}</option>)}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Specific focus</span>
              <textarea rows={3} value={detail} onChange={(event) => setDetail(event.target.value)}
                placeholder="e.g. Studying the research report and extracting insights for the brand strategy"
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-5 text-[#0D1B39] outline-none focus:border-blue-300" />
            </label>

            <div className="flex items-center gap-2">
              <button type="button" onClick={saveFocus} disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save focus
              </button>
              <button type="button" onClick={togglePause} disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {session.status === "paused" ? <CirclePlay className="h-4 w-4" /> : <CirclePause className="h-4 w-4" />}
                {session.status === "paused" ? "Resume" : "Pause"}
              </button>
            </div>
          </div>
        </div>
      )}

      <button type="button" onClick={() => setExpanded((open) => !open)}
        className="flex max-w-[88vw] items-center gap-3 rounded-2xl border border-white/80 bg-[#040B37] px-3.5 py-3 text-left text-white shadow-xl transition hover:-translate-y-0.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${session.status === "active" ? "bg-emerald-400/20 text-emerald-300" : "bg-amber-400/20 text-amber-300"}`}>
          {session.status === "active" ? <SelectedIcon className="h-4.5 w-4.5" /> : <CirclePause className="h-4.5 w-4.5" />}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
            <span className={`h-1.5 w-1.5 rounded-full ${session.status === "active" ? "bg-emerald-400" : "bg-amber-400"}`} />
            {session.status === "active" ? "Focus active" : "Session paused"}
          </span>
          <span className="mt-0.5 block max-w-[230px] truncate text-[12px] font-semibold">
            {selectedTask?.title || detail || selectedCategory.label}
          </span>
          {lastSavedAt && <span className="block text-[9.5px] text-white/35">Saved automatically</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/50 transition ${expanded ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}
