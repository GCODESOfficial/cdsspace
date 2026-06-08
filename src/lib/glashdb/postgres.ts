import { Pool, type QueryResultRow } from "pg";
import { getGlashDbDirectUrl } from "@/lib/glashdb/env";

declare global {
  var glashPostgresPool: Pool | undefined;
}

function createPool() {
  return new Pool({
    connectionString: getGlashDbDirectUrl(),
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  });
}

export const glashPool = globalThis.glashPostgresPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalThis.glashPostgresPool = glashPool;
}

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
