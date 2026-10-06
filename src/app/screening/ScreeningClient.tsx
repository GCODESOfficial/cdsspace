"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Loader2,
  LogOut,
  MapPin,
  CalendarClock,
  Backpack,
  Info,
  ClipboardList,
  Wrench,
  Mic,
  Lock,
  CheckCircle2,
  Ban,
  ShieldCheck,
  ArrowRight,
  Clock3,
} from "lucide-react";
import ObjectiveTest from "./ObjectiveTest";
import Link from "next/link";

interface Stage {
  status: string;
  score: number | null;
  feedback?: string | null;
}

interface InterviewStage extends Stage {
  scheduled_at?: string | null;
  venue?: string | null;
  notes?: string | null;
}

interface Candidate {
  full_name: string;
  email: string;
  role_title: string | null;
  role_type: string | null;
  role_location: string | null;
  scheduled_at: string | null;
  location: string | null;
  bring_items: string | null;
  instructions: string | null;
  decision: "in_progress" | "passed" | "failed";
  objective: {
    status: "not_started" | "in_progress" | "submitted" | "terminated";
    score: number | null;
    total: number | null;
    termination_reason: string | null;
    question_count: number;
    expected_count: number;
    open: boolean;
    available: boolean;
    submitted_at: string | null;
  };
  practical: Stage;
  interview: InterviewStage;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function countdown(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

const GRADIENT = "linear-gradient(146deg, #0035C1 8.83%, #0575FF 86.3%)";

export default function ScreeningClient() {
  const [loading, setLoading] = useState(true);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/screening/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setCandidate(data?.authenticated ? data.candidate : null);
    } catch {
      setCandidate(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const logout = async () => {
    await fetch("/api/screening/logout", { method: "POST" });
    setCandidate(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg">
        <Loader2 className="h-7 w-7 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!candidate) {
    return <LoginView onSuccess={fetchMe} />;
  }

  return (
    <>
      {showTest && (
        <ObjectiveTest
          candidateName={candidate.full_name}
          onClose={() => {
            setShowTest(false);
            fetchMe();
          }}
        />
      )}
      <Dashboard candidate={candidate} now={now} onLogout={logout} onStartObjective={() => setShowTest(true)} />
    </>
  );
}

/* ─────────────────────────── Login ─────────────────────────── */
function LoginView({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/screening/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), tracking_code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        onSuccess();
        return;
      }
      setError(data?.error || "Login failed. Check your details and try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-bg px-4 py-10">
      {/* ambient brand glow */}
      <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-blue-300/30 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-[28px] border border-brand-stroke bg-white p-7 shadow-[0_24px_60px_rgba(4,11,55,0.12)] sm:p-9"
      >
        <Image src="/images/cds-logo.svg" alt="CDS Space" width={92} height={32} className="brightness-0" />

        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-brand-blue">
          <ShieldCheck className="h-3.5 w-3.5" /> Screening Portal
        </div>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight text-brand-navy sm:text-3xl">Welcome, candidate.</h1>
        <p className="mt-2 text-sm text-brand-body">
          Sign in with the <strong>email</strong> you applied with and your <strong>application tracking code</strong>. Access opens only after you&apos;ve been shortlisted.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-brand-body">Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full rounded-[14px] border border-brand-stroke bg-brand-bg px-4 py-3.5 text-sm text-brand-navy outline-none transition focus:border-brand-blue/50 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-brand-body">Tracking code</label>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CDS-XXXXXX"
              className="w-full rounded-[14px] border border-brand-stroke bg-brand-bg px-4 py-3.5 text-sm font-semibold tracking-wider text-brand-navy outline-none transition focus:border-brand-blue/50 focus:bg-white"
            />
          </div>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold text-white shadow-lg transition active:scale-[0.99] disabled:opacity-60"
            style={{ backgroundImage: GRADIENT }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Enter portal <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-brand-mute">
          Lost your tracking code? Check it on the{" "}
          <Link href="/Career" className="font-semibold text-brand-blue hover:underline">careers page</Link>.
        </p>
      </motion.div>
    </div>
  );
}

/* ─────────────────────────── Dashboard ─────────────────────────── */
function Dashboard({
  candidate,
  now,
  onLogout,
  onStartObjective,
}: {
  candidate: Candidate;
  now: number;
  onLogout: () => void;
  onStartObjective: () => void;
}) {
  const c = candidate;
  const scheduled = formatDate(c.scheduled_at);
  const cd = countdown(c.scheduled_at, now);

  return (
    <div className="min-h-screen bg-brand-bg pb-16">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-brand-stroke bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Image src="/images/cds-logo.svg" alt="CDS Space" width={80} height={28} className="brightness-0" />
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-full border border-brand-stroke px-3.5 py-1.5 text-xs font-semibold text-brand-body transition hover:bg-brand-bg"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
        {/* Greeting + role */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[26px] p-6 text-white shadow-xl sm:p-8" style={{ backgroundImage: GRADIENT }}>
          <p className="text-sm font-medium text-white/80">Hi {c.full_name.split(" ")[0]}, you&apos;re screening for</p>
          <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">{c.role_title || "Your role"}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {c.role_type && <Badge>{c.role_type}</Badge>}
            {c.role_location && (
              <Badge>
                <MapPin className="h-3 w-3" /> {c.role_location}
              </Badge>
            )}
            <DecisionBadge decision={c.decision} />
          </div>
        </motion.div>

        {/* Schedule card */}
        <SectionCard className="mt-5" icon={CalendarClock} title="Your screening appointment">
          {scheduled ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-blue" />
                <div>
                  <p className="text-sm font-semibold text-brand-navy">{scheduled}</p>
                  {cd && <p className="text-xs font-medium text-brand-blue">{cd}</p>}
                </div>
              </div>
              {c.location && (
                <InfoRow icon={MapPin} label="Location">
                  {c.location}
                </InfoRow>
              )}
              {c.bring_items && (
                <InfoRow icon={Backpack} label="What to bring">
                  {c.bring_items}
                </InfoRow>
              )}
              {c.instructions && (
                <InfoRow icon={Info} label="Notes from the team">
                  {c.instructions}
                </InfoRow>
              )}
            </div>
          ) : (
            <p className="text-sm text-brand-body">
              Your screening date, location and what to bring will appear here once the team schedules you. Check back soon.
            </p>
          )}
        </SectionCard>

        {/* Tests */}
        <div className="mt-6 mb-2 flex items-center gap-2 px-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-brand-mute">Your screening stages</h2>
        </div>

        <div className="space-y-4">
          <ObjectiveCard candidate={c} onStart={onStartObjective} />
          <RatedCard
            icon={Wrench}
            title="Practical Test"
            blurb="A hands-on task assessed in person by our team. Your rating appears here once scored."
            stage={c.practical}
          />
          <RatedCard
            icon={Mic}
            title="Interview / Oral"
            blurb="A conversation with the team about your experience and fit. Your rating appears here once scored."
            stage={c.interview}
            appointment={
              c.interview.scheduled_at || c.interview.venue || c.interview.notes
                ? { scheduled_at: c.interview.scheduled_at ?? null, venue: c.interview.venue ?? null, notes: c.interview.notes ?? null, now }
                : undefined
            }
          />
        </div>

        <p className="mt-8 text-center text-xs text-brand-mute">
          Need help? Reply to your shortlist email and our team will assist.
        </p>
      </main>
    </div>
  );
}

/* ─────────────────────────── Pieces ─────────────────────────── */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold capitalize text-white backdrop-blur">
      {children}
    </span>
  );
}

function DecisionBadge({ decision }: { decision: Candidate["decision"] }) {
  if (decision === "passed")
    return <span className="inline-flex items-center gap-1 rounded-full bg-green-400/90 px-3 py-1 text-xs font-bold text-white"><CheckCircle2 className="h-3 w-3" /> Passed</span>;
  if (decision === "failed")
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-400/90 px-3 py-1 text-xs font-bold text-white"><Ban className="h-3 w-3" /> Not selected</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white"><Clock3 className="h-3 w-3" /> In progress</span>;
}

function SectionCard({
  icon: Icon,
  title,
  children,
  className = "",
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[22px] border border-brand-stroke bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-blue" />
        <h3 className="text-[15px] font-bold text-brand-navy">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-mute" />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-mute">{label}</p>
        <p className="text-sm text-brand-navy">{children}</p>
      </div>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: "blue" | "green" | "amber" | "red" | "gray"; children: React.ReactNode }) {
  const map = {
    blue: "bg-blue-50 text-brand-blue",
    green: "bg-green-50 text-brand-success",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    gray: "bg-gray-100 text-gray-500",
  } as const;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${map[tone]}`}>{children}</span>;
}

function ObjectiveCard({ candidate, onStart }: { candidate: Candidate; onStart: () => void }) {
  const o = candidate.objective;

  let pill: React.ReactNode;
  if (o.status === "submitted") pill = <StatusPill tone="green"><CheckCircle2 className="h-3 w-3" /> Submitted</StatusPill>;
  else if (o.status === "terminated") pill = <StatusPill tone="red"><Ban className="h-3 w-3" /> Ended</StatusPill>;
  else if (o.available) pill = <StatusPill tone="blue"><Clock3 className="h-3 w-3" /> Ready</StatusPill>;
  else pill = <StatusPill tone="gray"><Lock className="h-3 w-3" /> Locked</StatusPill>;

  return (
    <div className="rounded-[22px] border border-brand-stroke bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-brand-blue">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-brand-navy">Objective Test</h3>
            <p className="text-xs text-brand-mute">{o.expected_count} questions · 10 minutes · 60s each</p>
          </div>
        </div>
        {pill}
      </div>

      <div className="mt-4">
        {o.status === "submitted" && (
          <div className="flex items-center justify-between rounded-2xl bg-green-50 px-4 py-3">
            <span className="text-sm font-medium text-brand-success">Completed - awaiting overall outcome</span>
            {o.score != null && o.total != null && (
              <span className="text-sm font-extrabold text-brand-navy">{o.score}/{o.total}</span>
            )}
          </div>
        )}

        {o.status === "terminated" && (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-600">
            <p className="font-semibold">Test ended early.</p>
            {o.termination_reason && <p className="mt-0.5">{o.termination_reason}</p>}
            <p className="mt-1 text-red-500/90">Your status is back to <strong>Reviewing</strong> - an admin must re-shortlist you to retry.</p>
          </div>
        )}

        {(o.status === "not_started" || o.status === "in_progress") && (
          <>
            {o.available ? (
              <button
                onClick={onStart}
                className="flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.99]"
                style={{ backgroundImage: GRADIENT }}
              >
                {o.status === "in_progress" ? "Resume objective test" : "Start objective test"} <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <div className="rounded-2xl bg-brand-bg px-4 py-3 text-[13px] text-brand-body">
                {!o.open
                  ? "This unlocks at your scheduled screening time. Come back then to begin."
                  : o.question_count === 0
                    ? "Your test questions are being prepared. Check back shortly."
                    : "Not available yet."}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RatedCard({
  icon: Icon,
  title,
  blurb,
  stage,
  appointment,
}: {
  icon: React.ElementType;
  title: string;
  blurb: string;
  stage: Stage;
  appointment?: { scheduled_at: string | null; venue: string | null; notes: string | null; now: number };
}) {
  const rated = stage.status === "rated" && stage.score != null;
  const apptDate = appointment ? formatDate(appointment.scheduled_at) : null;
  const apptCd = appointment ? countdown(appointment.scheduled_at, appointment.now) : null;
  return (
    <div className="rounded-[22px] border border-brand-stroke bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-brand-blue">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-brand-navy">{title}</h3>
            <p className="text-xs text-brand-mute">Rated by the CDS team</p>
          </div>
        </div>
        {rated ? (
          <StatusPill tone="green"><CheckCircle2 className="h-3 w-3" /> Rated</StatusPill>
        ) : (
          <StatusPill tone="amber"><Clock3 className="h-3 w-3" /> Pending</StatusPill>
        )}
      </div>

      {appointment && (
        <div className="mt-4 space-y-3 rounded-2xl bg-brand-bg px-4 py-3">
          {apptDate && (
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-blue" />
              <div>
                <p className="text-sm font-semibold text-brand-navy">{apptDate}</p>
                {apptCd && <p className="text-xs font-medium text-brand-blue">{apptCd}</p>}
              </div>
            </div>
          )}
          {appointment.venue && (
            <InfoRow icon={MapPin} label="Venue">{appointment.venue}</InfoRow>
          )}
          {appointment.notes && (
            <InfoRow icon={Info} label="Notes from the team">{appointment.notes}</InfoRow>
          )}
        </div>
      )}

      <div className="mt-4">
        {rated ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-bg">
                <div className="h-full rounded-full" style={{ width: `${stage.score}%`, backgroundImage: GRADIENT }} />
              </div>
              <span className="text-sm font-extrabold text-brand-navy">{stage.score}/100</span>
            </div>
            {stage.feedback && <p className="rounded-2xl bg-brand-bg px-4 py-3 text-[13px] text-brand-body">{stage.feedback}</p>}
          </div>
        ) : (
          <p className="text-[13px] text-brand-body">{blurb}</p>
        )}
      </div>
    </div>
  );
}
