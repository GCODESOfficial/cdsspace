import { Pool, type QueryResultRow } from "pg";
import { getGlashDbDatabaseUrl, getGlashDbDirectUrl } from "@/lib/glashdb/env";

declare global {
  var glashPostgresPool: Pool | undefined;
  var glashPostgresFallbackPool: Pool | undefined;
  var glashPostgresDirectUnavailableUntil: number | undefined;
}

function createPool(connectionString: string, max = 24) {
  return new Pool({
    connectionString,
    // Higher ceiling so bursts of concurrent requests don't queue behind a
    // small pool. GlashDB is remote, so connection setup is the expensive part.
    max,
    // Keep warm connections around longer to avoid paying the TCP+TLS+auth
    // handshake on every burst (this is the biggest per-request latency win
    // for a remote database).
    idleTimeoutMillis: 60_000,
    // Neon may need more than eight seconds to wake a cold database. Keep this
    // above the observed cold-start time while retaining separate bounded
    // statement and query timeouts below.
    connectionTimeoutMillis: 20_000,
    // Prevent idle TCP connections from being silently dropped by the network,
    // which otherwise forces a slow reconnect on the next query.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // A single runaway query must never pin a pooled connection indefinitely.
    statement_timeout: 20_000,
    query_timeout: 25_000,
  });
}

// Reuse one pool per server instance in every environment (a fresh pool per
// module evaluation would leak connections and slow cold paths).
const directUrl = getGlashDbDirectUrl();
const databaseUrl = getGlashDbDatabaseUrl();

export const glashPool = globalThis.glashPostgresPool ?? createPool(directUrl);
globalThis.glashPostgresPool = glashPool;

const fallbackPool = directUrl === databaseUrl
  ? glashPool
  : (globalThis.glashPostgresFallbackPool ?? createPool(databaseUrl, 16));
globalThis.glashPostgresFallbackPool = fallbackPool;

function isConnectionFailure(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code || "");
  return ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ECONNRESET", "57P01", "57P02", "57P03"].includes(code);
}

export async function glashQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const now = Date.now();
  const directCoolingDown = directUrl !== databaseUrl
    && Number(globalThis.glashPostgresDirectUnavailableUntil || 0) > now;

  if (directCoolingDown) {
    const result = await fallbackPool.query<T>(text, params);
    return result.rows;
  }

  try {
    const result = await glashPool.query<T>(text, params);
    return result.rows;
  } catch (error) {
    if (directUrl === databaseUrl || !isConnectionFailure(error)) throw error;
    // A stale/unresolvable DIRECT_URL must not take the whole application
    // offline. Prefer it again after a short cooldown, but serve requests from
    // the working pooled DATABASE_URL in the meantime.
    globalThis.glashPostgresDirectUnavailableUntil = Date.now() + 60_000;
    const result = await fallbackPool.query<T>(text, params);
    return result.rows;
  }
}

export async function glashMaybeOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await glashQuery<T>(text, params);
  return rows[0] ?? null;
}

export async function glashOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T> {
  const row = await glashMaybeOne<T>(text, params);
  if (!row) throw new Error("Expected one GlashDB row, received none.");
  return row;
}
