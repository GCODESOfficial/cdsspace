"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ShieldAlert,
  Clock,
  Loader2,
  CheckCircle2,
  ChevronRight,
  Maximize2,
  Eye,
  Ban,
} from "lucide-react";

interface Question {
  id: string;
  position: number;
  prompt: string;
  options: string[];
}

interface StartPayload {
  deadline: string;
  server_now: string;
  remaining_ms: number;
  per_question_seconds: number;
  total_minutes: number;
  max_warnings: number;
  warning_count: number;
  answered: Record<string, number | null>;
  questions: Question[];
}

type Phase = "rules" | "loading" | "running" | "submitting" | "done" | "terminated";

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const RULES = [
  { icon: Clock, text: "10 questions in 10 minutes. Each question is shown for 60 seconds, then it auto-advances - answered or not." },
  { icon: ChevronRight, text: "You cannot return to a previous question. Pick carefully before moving on." },
  { icon: Eye, text: "Do NOT switch tabs, minimise, or open another app or window. The first time is a warning. The next time, the test ends immediately." },
  { icon: Ban, text: "If the test ends for leaving, your status returns to “Reviewing”. You'll need an admin to re-shortlist you to try again." },
  { icon: Maximize2, text: "On supported devices the test runs in full-screen. Stay in full-screen until you finish." },
];

export default function ObjectiveTest({
  candidateName,
  onClose,
}: {
  candidateName: string;
  onClose: (result: { submitted?: boolean; terminated?: boolean; reason?: string; score?: number; total?: number }) => void;
}) {
  const [phase, setPhase] = useState<Phase>("rules");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [deadlineMs, setDeadlineMs] = useState<number>(0);
  const [perQuestion, setPerQuestion] = useState(60);
  const [now, setNow] = useState<number>(() => Date.now());
  const [questionStart, setQuestionStart] = useState<number>(() => Date.now());

  const [warningOpen, setWarningOpen] = useState(false);
  const [warningMsg, setWarningMsg] = useState("");
  const [terminatedReason, setTerminatedReason] = useState("");
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);

  // clock offset (serverNow - clientNow) so timers match the server deadline
  const offsetRef = useRef(0);
  // de-dupe rapid anti-cheat events (one "leave" can fire blur + visibility)
  const lastViolationRef = useRef(0);
  const phaseRef = useRef<Phase>("rules");
  const enteredFullscreenRef = useRef(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const current = questions[idx];
  const remainingTotal = Math.max(0, deadlineMs - (now + offsetRef.current));
  const perQuestionRemaining = Math.max(0, perQuestion * 1000 - (now - questionStart));

  // ── API helpers ──────────────────────────────────────────────────────────
  const post = useCallback(async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json().catch(() => ({}));
  }, []);

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPhase("submitting");
    try {
      const data = await post("/api/screening/objective/submit");
      if (data?.ok) {
        setResult({ score: data.score ?? 0, total: data.total ?? questions.length });
        setPhase("done");
        exitFullscreen();
        return;
      }
      setError(data?.error || "Could not submit your test.");
      setPhase("running");
      submittingRef.current = false;
    } catch {
      setError("Network error while submitting.");
      setPhase("running");
      submittingRef.current = false;
    }
  }, [post, questions.length]);

  const handleTerminated = useCallback(
    (reason: string) => {
      if (phaseRef.current === "terminated") return;
      setTerminatedReason(reason);
      setPhase("terminated");
      exitFullscreen();
    },
    [],
  );

  const reportViolation = useCallback(
    async (kind: string) => {
      if (phaseRef.current !== "running") return;
      const t = Date.now();
      if (t - lastViolationRef.current < 1800) return; // one "leave" = one report
      lastViolationRef.current = t;
      const data = await post("/api/screening/objective/violation", {
        kind,
        question_position: questions[idx]?.position ?? null,
      });
      if (data?.terminated) {
        handleTerminated(data.reason || "You left the test after a warning.");
      } else if (data?.warning) {
        setWarningMsg(data.message || "Warning: leaving the test again will end it immediately.");
        setWarningOpen(true);
      }
    },
    [post, questions, idx, handleTerminated],
  );

  // ── Start the test ───────────────────────────────────────────────────────
  const begin = useCallback(async () => {
    setPhase("loading");
    setError(null);
    // Best-effort fullscreen (not supported on iOS Safari - we still rely on
    // visibility/blur detection there, so the test stays mobile-friendly).
    try {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        enteredFullscreenRef.current = true;
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
        enteredFullscreenRef.current = true;
      }
    } catch {
      /* fullscreen denied - continue anyway */
    }

    const data: StartPayload & { ok?: boolean; error?: string } = await post("/api/screening/objective/start");
    if (!data?.ok) {
      setError(data?.error || "Could not start the test.");
      setPhase("rules");
      return;
    }
    offsetRef.current = new Date(data.server_now).getTime() - Date.now();
    setQuestions(data.questions);
    setDeadlineMs(new Date(data.deadline).getTime());
    setPerQuestion(data.per_question_seconds || 60);
    const pre: Record<string, number> = {};
    for (const [qid, sel] of Object.entries(data.answered || {})) {
      if (typeof sel === "number") pre[qid] = sel;
    }
    setSelected(pre);
    // Resume at the first unanswered question.
    const firstUnanswered = data.questions.findIndex((q) => pre[q.id] === undefined);
    setIdx(firstUnanswered === -1 ? 0 : firstUnanswered);
    setQuestionStart(Date.now());
    setNow(Date.now());
    setPhase("running");
  }, [post]);

  // ── Selecting + advancing ────────────────────────────────────────────────
  const choose = useCallback(
    (optionIndex: number) => {
      if (!current) return;
      setSelected((s) => ({ ...s, [current.id]: optionIndex }));
      // Persist immediately so a termination/timeout still keeps the answer.
      void post("/api/screening/objective/answer", { question_id: current.id, selected_index: optionIndex });
    },
    [current, post],
  );

  const advance = useCallback(() => {
    if (phaseRef.current !== "running") return;
    if (idx >= questions.length - 1) {
      void submit();
      return;
    }
    setIdx((i) => i + 1);
    setQuestionStart(Date.now());
  }, [idx, questions.length, submit]);

  // ── Ticking clock (drives both timers) ───────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  // Global deadline reached → auto-submit.
  useEffect(() => {
    if (phase === "running" && remainingTotal <= 0 && deadlineMs > 0) {
      void submit();
    }
  }, [phase, remainingTotal, deadlineMs, submit]);

  // Per-question 60s elapsed → auto-advance.
  useEffect(() => {
    if (phase === "running" && perQuestionRemaining <= 0) {
      advance();
    }
  }, [phase, perQuestionRemaining, advance]);

  // ── Anti-cheat listeners ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const onVisibility = () => {
      if (document.hidden) void reportViolation("visibility_hidden");
    };
    const onBlur = () => void reportViolation("tab_blur");
    const onFsChange = () => {
      const fsEl =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      if (enteredFullscreenRef.current && !fsEl) void reportViolation("fullscreen_exit");
    };
    const block = (e: Event) => e.preventDefault();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
    };
  }, [phase, reportViolation]);

  // Warn before unloading/closing the tab mid-test.
  useEffect(() => {
    if (phase !== "running") return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [phase]);

  const totalDanger = remainingTotal < 60_000;

  const answeredCount = useMemo(
    () => questions.filter((q) => selected[q.id] !== undefined).length,
    [questions, selected],
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-brand-navy/95 backdrop-blur-sm">
      <div className="min-h-full w-full px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {/* ── RULES ───────────────────────────────────────────── */}
            {phase === "rules" && (
              <motion.div
                key="rules"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="rounded-[24px] bg-white p-6 shadow-2xl sm:p-8"
              >
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-brand-blue">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-brand-navy">Objective Test - Rules</h2>
                    <p className="text-sm text-brand-body">Read carefully, {candidateName.split(" ")[0]}. These are strictly enforced.</p>
                  </div>
                </div>

                <ul className="space-y-3">
                  {RULES.map((r, i) => (
                    <li key={i} className="flex gap-3 rounded-2xl border border-brand-stroke bg-brand-bg/50 p-3.5">
                      <r.icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-blue" strokeWidth={1.9} />
                      <span className="text-[13.5px] leading-relaxed text-brand-body">{r.text}</span>
                    </li>
                  ))}
                </ul>

                {error && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
                )}

                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-brand-stroke p-4">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-5 w-5 accent-brand-blue"
                  />
                  <span className="text-sm font-medium text-brand-navy">
                    I understand the rules and I'm ready to start. The 10-minute timer begins the moment I tap “Begin”.
                  </span>
                </label>

                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
                  <button
                    onClick={() => onClose({})}
                    className="rounded-full border border-brand-stroke px-6 py-3 text-sm font-semibold text-brand-body transition hover:bg-brand-bg sm:flex-1"
                  >
                    Not yet
                  </button>
                  <button
                    disabled={!agreed}
                    onClick={begin}
                    className="rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1"
                    style={{ backgroundImage: "linear-gradient(146deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                  >
                    Begin test
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── LOADING ─────────────────────────────────────────── */}
            {phase === "loading" && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 rounded-[24px] bg-white p-12 text-center shadow-2xl">
                <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
                <p className="font-semibold text-brand-navy">Preparing your test…</p>
              </motion.div>
            )}

            {/* ── RUNNING ─────────────────────────────────────────── */}
            {(phase === "running" || phase === "submitting") && current && (
              <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Header timers */}
                <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-white/10 p-3 text-white backdrop-blur">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-wide">
                      Q{idx + 1} / {questions.length}
                    </span>
                    <span className="hidden text-xs text-white/70 sm:inline">{answeredCount} answered</span>
                  </div>
                  <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${totalDanger ? "bg-red-500 text-white" : "bg-white/15 text-white"}`}>
                    <Clock className="h-4 w-4" />
                    {fmt(remainingTotal)}
                  </div>
                </div>

                {/* Per-question 60s bar */}
                <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0575FF] to-[#7DB1FF] transition-[width] duration-200 ease-linear"
                    style={{ width: `${(perQuestionRemaining / (perQuestion * 1000)) * 100}%` }}
                  />
                </div>

                <div className="rounded-[24px] bg-white p-6 shadow-2xl sm:p-8">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand-blue">
                    {Math.ceil(perQuestionRemaining / 1000)}s left on this question
                  </p>
                  <h3 className="mb-5 text-lg font-bold leading-snug text-brand-navy sm:text-xl">{current.prompt}</h3>

                  <div className="space-y-2.5">
                    {current.options.map((opt, i) => {
                      const isSel = selected[current.id] === i;
                      return (
                        <button
                          key={i}
                          onClick={() => choose(i)}
                          className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition ${
                            isSel
                              ? "border-brand-blue bg-blue-50 shadow-sm"
                              : "border-brand-stroke bg-white hover:border-brand-stroke-ii hover:bg-brand-bg/50"
                          }`}
                        >
                          <span
                            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                              isSel ? "border-brand-blue bg-brand-blue text-white" : "border-brand-stroke-ii text-brand-mute"
                            }`}
                          >
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className={`text-[15px] font-medium ${isSel ? "text-brand-navy" : "text-brand-body"}`}>{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

                  <button
                    onClick={advance}
                    disabled={phase === "submitting"}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold text-white shadow-lg transition disabled:opacity-60"
                    style={{ backgroundImage: "linear-gradient(146deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                  >
                    {phase === "submitting" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : idx >= questions.length - 1 ? (
                      <>Submit test <CheckCircle2 className="h-4 w-4" /></>
                    ) : (
                      <>Next question <ChevronRight className="h-4 w-4" /></>
                    )}
                  </button>
                  <p className="mt-3 text-center text-xs text-brand-mute">You cannot return to a previous question.</p>
                </div>
              </motion.div>
            )}

            {/* ── DONE ────────────────────────────────────────────── */}
            {phase === "done" && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-[24px] bg-white p-8 text-center shadow-2xl">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-brand-success">
                  <CheckCircle2 className="h-9 w-9" />
                </div>
                <h2 className="text-2xl font-bold text-brand-navy">Test submitted</h2>
                <p className="mt-2 text-sm text-brand-body">
                  Well done. Your objective test has been recorded. Results feed into your overall screening outcome.
                </p>
                {result && (
                  <div className="mx-auto mt-5 inline-flex items-baseline gap-1 rounded-2xl bg-brand-bg px-6 py-4">
                    <span className="text-4xl font-extrabold text-brand-navy">{result.score}</span>
                    <span className="text-lg font-semibold text-brand-mute">/ {result.total}</span>
                  </div>
                )}
                <button
                  onClick={() => onClose({ submitted: true, score: result?.score, total: result?.total })}
                  className="mt-6 w-full rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg"
                  style={{ backgroundImage: "linear-gradient(146deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                >
                  Back to my screening
                </button>
              </motion.div>
            )}

            {/* ── TERMINATED ──────────────────────────────────────── */}
            {phase === "terminated" && (
              <motion.div key="term" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-[24px] bg-white p-8 text-center shadow-2xl">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
                  <Ban className="h-9 w-9" />
                </div>
                <h2 className="text-2xl font-bold text-brand-navy">Test ended</h2>
                <p className="mt-2 text-sm text-brand-body">{terminatedReason}</p>
                <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-600">
                  Your application status has been returned to <strong>Reviewing</strong>. An admin must re-shortlist you before you can attempt the test again.
                </p>
                <button
                  onClick={() => onClose({ terminated: true, reason: terminatedReason })}
                  className="mt-6 w-full rounded-full border border-brand-stroke px-6 py-3 text-sm font-bold text-brand-body transition hover:bg-brand-bg"
                >
                  Exit
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Warning overlay (first violation) */}
      <AnimatePresence>
        {warningOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm rounded-[24px] bg-white p-7 text-center shadow-2xl"
            >
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-bold text-brand-navy">Stay on this page</h3>
              <p className="mt-2 text-sm text-brand-body">{warningMsg}</p>
              <button
                onClick={() => setWarningOpen(false)}
                className="mt-5 w-full rounded-full px-6 py-3 text-sm font-bold text-white"
                style={{ backgroundImage: "linear-gradient(146deg, #0035C1 8.83%, #0575FF 86.3%)" }}
              >
                I'll stay - resume test
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  function exitFullscreen() {
    try {
      const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
      if (document.fullscreenElement && document.exitFullscreen) void document.exitFullscreen();
      else if (doc.webkitExitFullscreen) void doc.webkitExitFullscreen();
    } catch {
      /* ignore */
    }
  }
}
