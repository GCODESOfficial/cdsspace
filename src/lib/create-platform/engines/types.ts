export type EngineKey = "internal" | "creattie" | "magnific" | "openai";

export interface EngineRunContext {
  toolSlug: string;
  capability: string;
  input: Record<string, unknown>;
}

export interface EngineResult {
  output: Record<string, unknown>;
  title?: string | null;
  fileName?: string | null;
  outputFormat?: string | null;
  fileSizeBytes?: number | null;
  /** Estimated/real cost of this call, in cents, for budget accounting. */
  costCents?: number;
}

/** Thrown when this engine cannot handle the request -> orchestrator tries the next fallback. */
export class EngineUnavailable extends Error {}
/** Thrown when the engine tried and failed -> the job fails (no silent fallback). */
export class EngineFailed extends Error {}

export interface CreateEngineImpl {
  key: EngineKey;
  label: string;
  /** True when the engine's credentials/config are present in the environment. */
  isConfigured(): boolean;
  /** Whether this engine can serve the given tool/capability. */
  handles(toolSlug: string, capability: string): boolean;
  /** Run the request. Throw EngineUnavailable to fall through, EngineFailed to stop. */
  run(ctx: EngineRunContext): Promise<EngineResult>;
}

export function firstImageDataUrl(input: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.startsWith("data:image/")) return value;
  }
  return "";
}
