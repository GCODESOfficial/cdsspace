import { CreateEngineImpl, EngineResult, EngineRunContext, EngineUnavailable } from "./types";

// Creattie is a subscription illustration / Lottie library. It has no public
// redistribution API, and serving its licensed assets through a resold product
// may breach its licence. This engine is therefore GATED: the orchestrator only
// calls it when the admin has both enabled it AND attested redistribution rights,
// and it only operates against a compliant API endpoint the admin configures
// (CREATTIE_API_URL). We deliberately do NOT automate the web login or scrape
// assets. Until a compliant path is configured it reports unavailable and the
// request falls back to another brain.

const ASSET_TOOLS = new Set(["illustration-generator", "vector-generator", "logo-animation"]);

export const creattieEngine: CreateEngineImpl = {
  key: "creattie",
  label: "Creattie brain",
  isConfigured: () => Boolean(process.env.CREATTIE_API_URL && process.env.CREATTIE_EMAIL),
  handles: (toolSlug) => ASSET_TOOLS.has(toolSlug),
  async run(ctx: EngineRunContext): Promise<EngineResult> {
    const base = process.env.CREATTIE_API_URL || "";
    if (!base) {
      throw new EngineUnavailable("Creattie requires a compliant, licensed API endpoint (CREATTIE_API_URL) before it can serve assets.");
    }
    // A compliant integration would query `base` for a licensed asset matching the
    // prompt and return its hosted URL. Left to the licensed endpoint contract.
    const query = typeof ctx.input.prompt === "string" ? ctx.input.prompt : "";
    const res = await fetch(`${base.replace(/\/$/, "")}/search?q=${encodeURIComponent(query.slice(0, 200))}`, {
      headers: { Authorization: `Bearer ${process.env.CREATTIE_API_TOKEN || ""}` },
    }).catch(() => null);
    if (!res || !res.ok) throw new EngineUnavailable("Creattie endpoint did not return a licensed asset.");
    const json = await res.json().catch(() => ({})) as { url?: string; svg?: string };
    if (json.svg) {
      return { title: query.slice(0, 80) || "Creattie asset", fileName: "creattie.svg", outputFormat: "SVG", costCents: 0,
        output: { kind: "visual", svg: json.svg, title: query.slice(0, 80), engine: "creattie" } };
    }
    if (json.url?.startsWith("http") || json.url?.startsWith("data:")) {
      return { title: query.slice(0, 80) || "Creattie asset", fileName: "creattie.png", outputFormat: "PNG", costCents: 0,
        output: { kind: "image", pngDataUrl: json.url, title: query.slice(0, 80), engine: "creattie" } };
    }
    throw new EngineUnavailable("Creattie returned no usable asset.");
  },
};
