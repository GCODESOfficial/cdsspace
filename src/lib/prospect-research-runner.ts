import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { runEnrichmentPass } from "@/lib/prospect-research-pass";

/**
 * Research that outlives the page that started it.
 *
 * Research used to be a chain of requests from the open admin tab, so closing
 * it stopped the work part way through a directory of millions. Starting it
 * now records a run, and the server keeps advancing that run until someone
 * stops it or the admin who started it signs out.
 *
 * Passes are deliberately small and capped per sweep: the directory is worked
 * through steadily rather than tying up a request for minutes at a time.
 */
const BATCH_SIZE = 4;
/**
 * The longest a single run may last.
 *
 * Research calls paid services for every company, and a directory of millions
 * would otherwise keep spending for days from one press. Four hours is a long
 * working session; after that it stops by itself and is started again
 * deliberately rather than by accident.
 */
const MAX_RUN_HOURS = 4;
const BATCHES_PER_SWEEP = 3;
const SWEEP_EVERY_MS = 20_000;

declare global {
  var cdsProspectSweepAt: number | undefined;
  var cdsProspectSweepRunning: boolean | undefined;
}

export const RESEARCH_RUN_MAX_HOURS = MAX_RUN_HOURS;

export type ResearchRun = {
  id: string;
  startedBy: string;
  startedByName: string | null;
  status: "running" | "stopped" | "finished";
  startedAt: string;
  /** When this run stops by itself, four hours after it started. */
  endsAt: string;
  lastPassAt: string | null;
  processedTotal: number;
  lastError: string | null;
};

type RunRow = {
  id: string; started_by: string; started_by_name: string | null; status: string;
  started_at: string; last_pass_at: string | null; processed_total: number; last_error: string | null;
};

function mapped(row: RunRow): ResearchRun {
  return {
    id: row.id,
    endsAt: new Date(new Date(row.started_at).getTime() + MAX_RUN_HOURS * 60 * 60 * 1000).toISOString(),
    startedBy: row.started_by,
    startedByName: row.started_by_name,
    status: row.status === "stopped" || row.status === "finished" ? row.status : "running",
    startedAt: row.started_at,
    lastPassAt: row.last_pass_at,
    processedTotal: Number(row.processed_total || 0),
    lastError: row.last_error,
  };
}

const COLUMNS = "id::text, started_by, started_by_name, status, started_at::text, last_pass_at::text, processed_total, last_error";

/** Closes a run that has reached its limit, so nothing keeps spending unattended. */
export async function expireOverrunningRuns() {
  const rows = await glashQuery<{ id: string }>(
    `update public.prospect_research_runs
        set status = 'finished', stopped_at = now(),
            stopped_reason = 'it reached the ' || $1 || ' hour limit for one run'
      where status = 'running' and started_at < now() - ($1 || ' hours')::interval
      returning id::text`,
    [String(MAX_RUN_HOURS)],
  ).catch(() => []);
  return rows.length;
}

export async function activeResearchRun() {
  await expireOverrunningRuns();
  const row = await glashMaybeOne<RunRow>(
    `select ${COLUMNS} from public.prospect_research_runs where status = 'running' limit 1`,
  ).catch(() => null);
  return row ? mapped(row) : null;
}

export async function startResearchRun(input: { actorKey: string; actorName?: string | null }) {
  const existing = await activeResearchRun();
  if (existing) return existing;
  const row = await glashMaybeOne<RunRow>(
    `insert into public.prospect_research_runs (started_by, started_by_name)
     values ($1,$2)
     on conflict do nothing
     returning ${COLUMNS}`,
    [input.actorKey, input.actorName || null],
  );
  // A race against another admin pressing it at the same moment ends with one
  // run, which is the point of the single-active index.
  return row ? mapped(row) : await activeResearchRun();
}

export async function stopResearchRun(input: { actorKey?: string | null; reason: string }) {
  const rows = await glashQuery<{ id: string }>(
    `update public.prospect_research_runs
        set status = 'stopped', stopped_at = now(), stopped_reason = $2
      where status = 'running' and ($1::text is null or started_by = $1)
      returning id::text`,
    [input.actorKey || null, input.reason.slice(0, 200)],
  ).catch(() => []);
  return rows.length;
}

/**
 * Moves an active run along. Safe to call from anywhere and often: it does a
 * little work, or nothing at all when no run is active.
 */
export async function advanceResearchRun(options: { batches?: number; budgetMs?: number } = {}) {
  const run = await activeResearchRun();
  if (!run) return { ran: false as const };

  const batches = Math.max(1, Math.min(options.batches ?? BATCHES_PER_SWEEP, 10));
  const endsAt = new Date(run.startedAt).getTime() + MAX_RUN_HOURS * 60 * 60 * 1000;
  // A caller behind an HTTP timeout must get an answer, so each sweep stops
  // taking new batches once its own time budget is spent.
  const deadline = Date.now() + Math.max(5_000, options.budgetMs ?? 90_000);
  let processed = 0;
  let remaining = 0;
  for (let pass = 0; pass < batches; pass += 1) {
    if (pass > 0 && Date.now() >= deadline) break;
    if (Date.now() >= endsAt) {
      await expireOverrunningRuns();
      return { ran: true as const, processed, remaining, expired: true };
    }
    try {
      const result = await runEnrichmentPass({ limit: BATCH_SIZE, actor: run.startedBy });
      processed += result.processed.length;
      remaining = result.remaining;
      if (!result.processed.length || result.remaining === 0) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Research failed.";
      await glashQuery(
        `update public.prospect_research_runs set last_error = $2, last_pass_at = now() where id = $1::uuid`,
        [run.id, message.slice(0, 500)],
      ).catch(() => []);
      return { ran: true as const, processed, remaining, error: message };
    }
  }

  await glashQuery(
    `update public.prospect_research_runs
        set processed_total = processed_total + $2, last_pass_at = now(), last_error = null
      where id = $1::uuid`,
    [run.id, processed],
  ).catch(() => []);

  // Nothing left to research: the run has finished rather than been abandoned.
  if (remaining === 0) {
    await glashQuery(
      `update public.prospect_research_runs set status = 'finished', stopped_at = now(), stopped_reason = 'the queue is empty' where id = $1::uuid`,
      [run.id],
    ).catch(() => []);
  }
  return { ran: true as const, processed, remaining };
}

/**
 * The platform's own heartbeat. Ordinary admin traffic nudges an active run
 * along, so research keeps moving without depending on an external scheduler.
 */
export async function sweepResearchIfDue() {
  const now = Date.now();
  if (globalThis.cdsProspectSweepRunning) return null;
  if (globalThis.cdsProspectSweepAt && now - globalThis.cdsProspectSweepAt < SWEEP_EVERY_MS) return null;
  globalThis.cdsProspectSweepAt = now;
  globalThis.cdsProspectSweepRunning = true;
  try {
    return await advanceResearchRun({ batches: 1 });
  } catch (error) {
    console.error("[prospect-research] sweep failed", error);
    return null;
  } finally {
    globalThis.cdsProspectSweepRunning = false;
  }
}
