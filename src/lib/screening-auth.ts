import { cookies } from "next/headers";
import crypto from "crypto";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

export const SCREENING_COOKIE = "screening_session";
const SESSION_HOURS = 12;

/** Objective test rules - kept here so portal + API agree on the numbers. */
export const OBJECTIVE_QUESTION_COUNT = 10;
export const OBJECTIVE_TOTAL_MINUTES = 10;
export const OBJECTIVE_PER_QUESTION_SECONDS = 60;
export const OBJECTIVE_MAX_WARNINGS = 1; // 1 warning, then the next violation terminates

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function sessionExpiresAt(): string {
  return new Date(Date.now() + 1000 * 60 * 60 * SESSION_HOURS).toISOString();
}

export function screeningCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * SESSION_HOURS,
  };
}

export interface ScreeningCandidate {
  id: string;
  application_id: string;
  role_id: string | null;
  email: string;
  full_name: string;
  scheduled_at: string | null;
  location: string | null;
  bring_items: string | null;
  instructions: string | null;
  objective_status: "not_started" | "in_progress" | "submitted" | "terminated";
  objective_score: number | null;
  objective_total: number | null;
  objective_started_at: string | null;
  objective_deadline: string | null;
  objective_submitted_at: string | null;
  termination_reason: string | null;
  warning_count: number;
  objective_unlocked: boolean;
  practical_status: "pending" | "rated";
  practical_score: number | null;
  practical_feedback: string | null;
  interview_status: "pending" | "rated";
  interview_score: number | null;
  interview_feedback: string | null;
  decision: "in_progress" | "passed" | "failed";
  session_expires_at: string | null;
  // joined
  application_status: string;
  role_title: string | null;
  role_type: string | null;
  role_location: string | null;
}

const CANDIDATE_SELECT = `
  select c.id, c.application_id, c.role_id, c.email, c.full_name,
         c.scheduled_at, c.location, c.bring_items, c.instructions,
         c.objective_status, c.objective_score, c.objective_total,
         c.objective_started_at, c.objective_deadline, c.objective_submitted_at,
         c.termination_reason, c.warning_count, c.objective_unlocked,
         c.practical_status, c.practical_score, c.practical_feedback,
         c.interview_status, c.interview_score, c.interview_feedback,
         c.decision, c.session_expires_at,
         ra.status as application_status,
         r.title as role_title, r.role_type as role_type, r.location as role_location
    from public.screening_candidates c
    join public.role_applications ra on ra.id = c.application_id
    left join public.open_roles r on r.id = c.role_id`;

/**
 * Resolve the screening candidate behind a session token.
 *
 * Returns null when the token is missing/expired, OR when the underlying
 * application is no longer `shortlisted` (e.g. it reverted to `reviewing`
 * after the applicant was caught cheating). This is what locks a terminated
 * candidate out until an admin re-shortlists them.
 */
export async function getScreeningCandidateFromToken(
  token: string | undefined | null,
): Promise<ScreeningCandidate | null> {
  if (!token) return null;
  const row = await glashMaybeOne<ScreeningCandidate>(
    `${CANDIDATE_SELECT}
     where c.session_token = $1
       and c.session_expires_at is not null
       and c.session_expires_at > now()
     limit 1`,
    [token],
  );
  if (!row) return null;
  if (row.application_status !== "shortlisted") return null;
  return row;
}

/** Read the screening candidate for the current request, or null. */
export async function getScreeningCandidate(): Promise<ScreeningCandidate | null> {
  const store = await cookies();
  return getScreeningCandidateFromToken(store.get(SCREENING_COOKIE)?.value);
}

/** Re-read a candidate by id (after a write) including the joined fields. */
export async function getScreeningCandidateById(id: string): Promise<ScreeningCandidate | null> {
  return glashMaybeOne<ScreeningCandidate>(`${CANDIDATE_SELECT} where c.id = $1 limit 1`, [id]);
}

/**
 * Ensure a screening_candidates row exists for a shortlisted application,
 * returning its id. Idempotent - safe to call on every login / admin load.
 */
export async function ensureCandidateForApplication(applicationId: string): Promise<string | null> {
  const existing = await glashMaybeOne<{ id: string }>(
    `select id from public.screening_candidates where application_id = $1 limit 1`,
    [applicationId],
  );
  if (existing) return existing.id;

  const app = await glashMaybeOne<{
    id: string;
    role_id: string | null;
    email: string;
    full_name: string;
  }>(
    `select id, role_id, lower(email) as email, full_name
       from public.role_applications where id = $1 limit 1`,
    [applicationId],
  );
  if (!app) return null;

  const inserted = await glashMaybeOne<{ id: string }>(
    `insert into public.screening_candidates (application_id, role_id, email, full_name)
     values ($1, $2, $3, $4)
     on conflict (application_id) do update set role_id = excluded.role_id
     returning id`,
    [app.id, app.role_id, app.email, app.full_name],
  );
  return inserted?.id ?? null;
}

/** Append an activity / anti-cheat event. Best-effort (never throws). */
export async function logScreeningEvent(
  candidateId: string,
  kind: string,
  detail?: string | null,
  questionPosition?: number | null,
): Promise<void> {
  try {
    await glashQuery(
      `insert into public.screening_events (candidate_id, kind, detail, question_position)
       values ($1, $2, $3, $4)`,
      [candidateId, kind, detail ?? null, questionPosition ?? null],
    );
  } catch {
    // Event logging must never break the test flow.
  }
}
