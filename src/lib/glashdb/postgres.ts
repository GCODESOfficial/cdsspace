import { Pool, type QueryResultRow } from "pg";
import { getGlashDbDirectUrl } from "@/lib/glashdb/env";

declare global {
  var glashPostgresPool: Pool | undefined;
}

function createPool() {
  return new Pool({
    connectionString: getGlashDbDirectUrl(),
    // Higher ceiling so bursts of concurrent requests don't queue behind a
    // small pool. GlashDB is remote, so connection setup is the expensive part.
    max: 24,
    // Keep warm connections around longer to avoid paying the TCP+TLS+auth
    // handshake on every burst (this is the biggest per-request latency win
    // for a remote database).
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 8_000,
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
export const glashPool = globalThis.glashPostgresPool ?? createPool();
globalThis.glashPostgresPool = glashPool;

export async function glashQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await glashPool.query<T>(text, params);
  return result.rows;
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
