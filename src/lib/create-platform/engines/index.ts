import { createHash } from "crypto";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { CreateEngineImpl, EngineFailed, EngineKey, EngineResult, EngineUnavailable } from "./types";
import { internalEngine } from "./internal";
import { openaiEngine } from "./openai";
import { magnificEngine } from "./magnific";
import { creattieEngine } from "./creattie";

const ENGINES: Record<EngineKey, CreateEngineImpl> = {
  internal: internalEngine,
  openai: openaiEngine,
  magnific: magnificEngine,
  creattie: creattieEngine,
};

const ENGINE_ORDER: EngineKey[] = ["internal", "openai", "magnific", "creattie"];

export interface EngineState {
  key: EngineKey;
  label: string;
  enabled: boolean;
  configured: boolean;
  dailyBudgetCents: number;
  spentTodayCents: number;
  costPerCallCents: number;
  licenseAttested: boolean;
  config: Record<string, unknown>;
}

function isEngineKey(v: string): v is EngineKey {
  return v === "internal" || v === "openai" || v === "magnific" || v === "creattie";
}

/** Load all engine rows, resetting the daily spend counter when the date rolls over. */
export async function loadEngineStates(): Promise<EngineState[]> {
  const rows = await glashQuery<Record<string, unknown>>(
    `update public.create_engines
        set spent_today_cents = case when spend_date < current_date then 0 else spent_today_cents end,
            spend_date = current_date
      returning key, label, enabled, daily_budget_cents, spent_today_cents, cost_per_call_cents, license_attested, config`,
  );
  return rows.filter((r) => isEngineKey(String(r.key))).map((r) => ({
    key: String(r.key) as EngineKey,
    label: String(r.label),
    enabled: Boolean(r.enabled),
    configured: ENGINES[String(r.key) as EngineKey].isConfigured(),
    dailyBudgetCents: Number(r.daily_budget_cents || 0),
    spentTodayCents: Number(r.spent_today_cents || 0),
    costPerCallCents: Number(r.cost_per_call_cents || 0),
    licenseAttested: Boolean(r.license_attested),
    config: (r.config as Record<string, unknown>) || {},
  }));
}

function budgetOk(state: EngineState): boolean {
  if (state.dailyBudgetCents <= 0) return true; // uncapped
  return state.spentTodayCents + Math.max(state.costPerCallCents, 0) <= state.dailyBudgetCents;
}

function engineUsable(state: EngineState | undefined, toolSlug: string): boolean {
  if (!state) return false;
  if (!state.enabled || !state.configured) return false;
  if (state.key === "creattie" && !state.licenseAttested) return false; // gated on redistribution rights
  if (!ENGINES[state.key].handles(toolSlug, "default")) return false;
  return budgetOk(state);
}

/** The ordered list of engine keys ready to serve a tool right now (primary first). */
export async function getReadyEngineChain(toolSlug: string): Promise<EngineKey[]> {
  const [states, route] = await Promise.all([
    loadEngineStates(),
    glashMaybeOne<Record<string, unknown>>(
      `select primary_engine, fallback_engines from public.create_engine_routes where tool_slug = $1 and capability = 'default'`,
      [toolSlug],
    ),
  ]);
  const byKey = new Map(states.map((s) => [s.key, s]));
  const ordered: EngineKey[] = [];
  if (route) {
    const primary = String(route.primary_engine);
    if (isEngineKey(primary)) ordered.push(primary);
    for (const f of (route.fallback_engines as string[]) || []) if (isEngineKey(f)) ordered.push(f);
  }
  // Always allow internal as an implicit last resort.
  if (!ordered.includes("internal")) ordered.push("internal");
  const seen = new Set<EngineKey>();
  return ordered.filter((k) => (seen.has(k) ? false : (seen.add(k), true))).filter((k) => engineUsable(byKey.get(k), toolSlug));
}

function cacheKey(engine: string, toolSlug: string, input: Record<string, unknown>): string {
  return createHash("sha256").update(`${engine}|${toolSlug}|${JSON.stringify(input)}`).digest("hex");
}

async function readCache(engine: string, toolSlug: string, input: Record<string, unknown>): Promise<EngineResult | null> {
  const row = await glashMaybeOne<Record<string, unknown>>(
    `update public.create_engine_cache set hits = hits + 1, last_hit_at = now()
      where cache_key = $1 returning output, file_name, output_format, file_size_bytes`,
    [cacheKey(engine, toolSlug, input)],
  );
  if (!row) return null;
  return {
    output: (row.output as Record<string, unknown>) || {},
    fileName: (row.file_name as string) || null,
    outputFormat: (row.output_format as string) || null,
    fileSizeBytes: row.file_size_bytes ? Number(row.file_size_bytes) : null,
    costCents: 0,
  };
}

async function writeCache(engine: string, toolSlug: string, input: Record<string, unknown>, result: EngineResult) {
  await glashQuery(
    `insert into public.create_engine_cache (cache_key, engine, tool_slug, output, file_name, output_format, file_size_bytes)
     values ($1, $2, $3, $4::jsonb, $5, $6, $7)
     on conflict (cache_key) do nothing`,
    [cacheKey(engine, toolSlug, input), engine, toolSlug, JSON.stringify(result.output), result.fileName || null, result.outputFormat || null, result.fileSizeBytes || null],
  );
}

async function recordSpend(engine: EngineKey, cents: number) {
  if (cents <= 0) return;
  await glashQuery(
    `update public.create_engines set spent_today_cents = spent_today_cents + $2, spend_date = current_date where key = $1`,
    [engine, Math.round(cents)],
  );
}

export interface QueuedJob {
  toolSlug: string;
  input: Record<string, unknown>;
}

export type ProcessOutcome =
  | { ok: true; engine: EngineKey; cached: boolean; result: EngineResult }
  | { ok: false; error: string };

/**
 * Run a queued job through the engine chain: cache -> each ready engine in order.
 * EngineUnavailable falls through to the next brain; EngineFailed stops with an error.
 */
export async function processQueuedJob(job: QueuedJob): Promise<ProcessOutcome> {
  const chain = await getReadyEngineChain(job.toolSlug);
  if (chain.length === 0) return { ok: false, error: "No brain is connected for this tool." };

  let lastError = "All brains were unavailable.";
  for (const key of chain) {
    const cached = await readCache(key, job.toolSlug, job.input);
    if (cached) return { ok: true, engine: key, cached: true, result: cached };
    try {
      const result = await ENGINES[key].run({ toolSlug: job.toolSlug, capability: "default", input: job.input });
      await Promise.all([recordSpend(key, result.costCents || 0), writeCache(key, job.toolSlug, job.input, result)]);
      return { ok: true, engine: key, cached: false, result };
    } catch (error) {
      if (error instanceof EngineFailed) return { ok: false, error: error.message };
      if (error instanceof EngineUnavailable) { lastError = error.message; continue; }
      lastError = error instanceof Error ? error.message : "Engine error.";
    }
  }
  return { ok: false, error: lastError };
}

export function engineList(): EngineKey[] {
  return [...ENGINE_ORDER];
}

/* ---------- Admin management ---------- */

export interface EngineRoute {
  toolSlug: string;
  capability: string;
  primaryEngine: string;
  fallbackEngines: string[];
}

export async function listEngineRoutes(): Promise<EngineRoute[]> {
  const rows = await glashQuery<Record<string, unknown>>(
    `select tool_slug, capability, primary_engine, fallback_engines from public.create_engine_routes order by tool_slug`,
  );
  return rows.map((r) => ({
    toolSlug: String(r.tool_slug),
    capability: String(r.capability),
    primaryEngine: String(r.primary_engine),
    fallbackEngines: ((r.fallback_engines as string[]) || []).filter(Boolean),
  }));
}

export async function updateEngine(key: string, patch: {
  enabled?: boolean;
  dailyBudgetCents?: number;
  costPerCallCents?: number;
  licenseAttested?: boolean;
  config?: Record<string, unknown>;
}): Promise<boolean> {
  if (!isEngineKey(key)) return false;
  const sets: string[] = [];
  const params: unknown[] = [key];
  const add = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (typeof patch.enabled === "boolean") add("enabled", patch.enabled);
  if (typeof patch.dailyBudgetCents === "number") add("daily_budget_cents", Math.max(0, Math.round(patch.dailyBudgetCents)));
  if (typeof patch.costPerCallCents === "number") add("cost_per_call_cents", Math.max(0, Math.round(patch.costPerCallCents)));
  if (typeof patch.licenseAttested === "boolean") add("license_attested", patch.licenseAttested);
  if (patch.config && typeof patch.config === "object") { params.push(JSON.stringify(patch.config)); sets.push(`config = $${params.length}::jsonb`); }
  if (!sets.length) return false;
  sets.push("updated_at = now()");
  await glashQuery(`update public.create_engines set ${sets.join(", ")} where key = $1`, params);
  return true;
}

export async function updateEngineRoute(toolSlug: string, primaryEngine: string, fallbackEngines: string[]): Promise<boolean> {
  if (!/^[a-z0-9-]{1,80}$/.test(toolSlug) || !isEngineKey(primaryEngine)) return false;
  const fallbacks = fallbackEngines.filter((f): f is EngineKey => isEngineKey(f) && f !== primaryEngine);
  await glashQuery(
    `insert into public.create_engine_routes (tool_slug, capability, primary_engine, fallback_engines, updated_at)
     values ($1, 'default', $2, $3, now())
     on conflict (tool_slug, capability) do update set primary_engine = excluded.primary_engine, fallback_engines = excluded.fallback_engines, updated_at = now()`,
    [toolSlug, primaryEngine, fallbacks],
  );
  return true;
}

export interface TrainingSample {
  id: string;
  engine: string;
  capability: string;
  label: string | null;
  prompt: string | null;
  source: string;
  tags: string[];
  status: string;
  createdAt: string;
}

export async function listTrainingSamples(capability?: string): Promise<TrainingSample[]> {
  const rows = capability
    ? await glashQuery<Record<string, unknown>>(
        `select id, engine, capability, label, prompt, source, tags, status, created_at from public.create_training_samples where capability = $1 order by created_at desc limit 200`, [capability])
    : await glashQuery<Record<string, unknown>>(
        `select id, engine, capability, label, prompt, source, tags, status, created_at from public.create_training_samples order by created_at desc limit 200`);
  return rows.map((r) => ({
    id: String(r.id), engine: String(r.engine), capability: String(r.capability),
    label: (r.label as string) ?? null, prompt: (r.prompt as string) ?? null,
    source: String(r.source), tags: ((r.tags as string[]) || []), status: String(r.status),
    createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : "",
  }));
}

export async function addTrainingSample(sample: {
  engine?: string; capability: string; label?: string; prompt?: string; assetRef?: string; tags?: string[]; createdBy?: string;
}): Promise<boolean> {
  const capability = (sample.capability || "").slice(0, 60);
  if (!capability) return false;
  const engine = isEngineKey(sample.engine || "") ? sample.engine : "internal";
  await glashQuery(
    `insert into public.create_training_samples (engine, capability, label, prompt, asset_ref, tags, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [engine, capability, (sample.label || "").slice(0, 200) || null, (sample.prompt || "").slice(0, 2000) || null,
     (sample.assetRef || "").slice(0, 3_000_000) || null, (sample.tags || []).slice(0, 20).map((t) => String(t).slice(0, 40)), (sample.createdBy || "").slice(0, 200) || null],
  );
  return true;
}

export async function deleteTrainingSample(id: string): Promise<boolean> {
  if (!id || id.length > 100) return false;
  await glashQuery(`delete from public.create_training_samples where id = $1::uuid`, [id]);
  return true;
}
