/* eslint-disable @typescript-eslint/no-explicit-any */
import { createGlashQueryClient, type GlashQueryPayload, type GlashQueryResult } from "@/lib/glashdb/query-core";

async function executeBrowserQuery(payload: GlashQueryPayload): Promise<GlashQueryResult> {
  if (typeof window === "undefined") {
    const { executeGlashQueryPayload } = await import("@/lib/glashdb/query-server");
    return executeGlashQueryPayload(payload);
  }

  try {
    const res = await fetch("/api/glashdb/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      return { data: null, error: { message: json?.error || `Glash query failed with ${res.status}` } };
    }
    return json;
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : "Glash query failed." },
    };
  }
}

export function createGlashBrowserQueryClient(extras: Record<string, any> = {}) {
  return createGlashQueryClient(executeBrowserQuery, extras);
}
