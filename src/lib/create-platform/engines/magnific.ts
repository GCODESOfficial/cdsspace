import { CreateEngineImpl, EngineFailed, EngineResult, EngineRunContext, EngineUnavailable, firstImageDataUrl } from "./types";

// Magnific (Freepik) exposes an image upscale/enhance API. The exact base URL and
// request shape are set from the engine config in the admin console so we never
// hard-code an endpoint that could drift; sensible defaults are provided here.
// If Magnific is unreachable or misconfigured we throw EngineUnavailable so the
// orchestrator falls back to the Internal brain instead of failing the job.

const UPSCALE_TOOLS = new Set(["image-restorer"]);

function creds(): { key: string; secret: string } {
  return { key: process.env.MAGNIFIC_API_KEY || "", secret: process.env.MAGNIFIC_SECRET || "" };
}

export const magnificEngine: CreateEngineImpl = {
  key: "magnific",
  label: "Magnific brain",
  isConfigured: () => Boolean(creds().key),
  handles: (toolSlug) => UPSCALE_TOOLS.has(toolSlug),
  async run(ctx: EngineRunContext): Promise<EngineResult> {
    const { key, secret } = creds();
    if (!key) throw new EngineUnavailable("Magnific key not configured.");

    const image = firstImageDataUrl(ctx.input, ["image", "source"]);
    if (!image) throw new EngineFailed("Upload an image to enhance.");

    const base = process.env.MAGNIFIC_API_URL || "https://api.freepik.com/v1/ai/image-upscaler";
    const scale = ctx.input.target === "2K" ? 2 : ctx.input.target === "4K" ? 4 : 2;

    let res: Response;
    try {
      res = await fetch(base, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-freepik-api-key": key,
          ...(secret ? { "x-api-secret": secret } : {}),
        },
        body: JSON.stringify({ image, scale_factor: scale, optimized_for: "standard" }),
      });
    } catch (error) {
      throw new EngineUnavailable(`Magnific unreachable: ${error instanceof Error ? error.message : "network error"}`);
    }
    if (res.status === 401 || res.status === 403) throw new EngineFailed("Magnific rejected the credentials.");
    if (!res.ok) throw new EngineUnavailable(`Magnific error ${res.status}.`);

    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    // Accept the common shapes: {data:{url|base64}} or {image} or {result}.
    const data = (json.data as Record<string, unknown>) || json;
    const url = typeof data.url === "string" ? data.url : typeof data.image === "string" ? data.image : "";
    const b64 = typeof data.base64 === "string" ? data.base64 : "";
    let pngDataUrl = "";
    if (b64) pngDataUrl = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
    else if (url.startsWith("data:")) pngDataUrl = url;
    else if (url) {
      const img = await fetch(url).catch(() => null);
      if (!img || !img.ok) throw new EngineUnavailable("Magnific result URL could not be fetched.");
      const buf = Buffer.from(await img.arrayBuffer());
      pngDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    }
    if (!pngDataUrl) throw new EngineUnavailable("Magnific returned an unrecognised response shape.");

    const title = "Enhanced image";
    return {
      title,
      fileName: "enhanced.png",
      outputFormat: "PNG",
      costCents: 8,
      output: { kind: "image", title, pngDataUrl, mimeType: "image/png", engine: "magnific" },
    };
  },
};
