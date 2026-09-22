import { CreateEngineImpl, EngineFailed, EngineResult, EngineRunContext, EngineUnavailable, firstImageDataUrl } from "./types";

const TEXT_TOOLS = new Set(["logo-ideator"]);
const IMAGE_TOOLS = new Set(["illustration-generator"]);
const EDIT_TOOLS = new Set(["background-remover"]);

function key(): string {
  return process.env.OPENAI_API_KEY || "";
}

async function chat(model: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.7 }),
  });
  if (!res.ok) throw new EngineFailed(`OpenAI text error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() || "";
}

function str(input: Record<string, unknown>, name: string): string {
  const v = input[name];
  return typeof v === "string" ? v.slice(0, 2000) : "";
}

export const openaiEngine: CreateEngineImpl = {
  key: "openai",
  label: "OpenAI brain",
  isConfigured: () => Boolean(key()),
  handles: (toolSlug) => TEXT_TOOLS.has(toolSlug) || IMAGE_TOOLS.has(toolSlug) || EDIT_TOOLS.has(toolSlug),
  async run(ctx: EngineRunContext): Promise<EngineResult> {
    if (!key()) throw new EngineUnavailable("OpenAI key not configured.");
    const model = "gpt-4o-mini";

    // Background removal: edit the uploaded image to a transparent cutout.
    if (EDIT_TOOLS.has(ctx.toolSlug)) {
      const image = firstImageDataUrl(ctx.input, ["image", "source"]);
      if (!image) throw new EngineFailed("Upload an image to process.");
      const bytes = Buffer.from(image.split(",")[1] || "", "base64");
      if (!bytes.length) throw new EngineFailed("Could not read the uploaded image.");
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", "Remove the background completely. Keep only the main subject, cleanly cut out on a fully transparent background.");
      form.append("size", "1024x1024");
      form.append("background", "transparent");
      form.append("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "input.png");
      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${key()}` },
        body: form,
      });
      if (!res.ok) throw new EngineFailed(`OpenAI edit error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = await res.json() as { data?: Array<{ b64_json?: string }> };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new EngineFailed("OpenAI returned no image.");
      const pngDataUrl = `data:image/png;base64,${b64}`;
      return {
        title: "Background removed", fileName: "cutout.png", outputFormat: "PNG", fileSizeBytes: Math.round((b64.length * 3) / 4), costCents: 4,
        output: { kind: "image", title: "Background removed", pngDataUrl, mimeType: "image/png", engine: "openai" },
      };
    }

    if (TEXT_TOOLS.has(ctx.toolSlug)) {
      const brand = str(ctx.input, "brandName") || "the brand";
      const industry = str(ctx.input, "industry");
      const prompt = ctx.toolSlug === "brand-name-checker"
        ? `Assess the brand name "${brand}"${industry ? ` in ${industry}` : ""}. Give: memorability, clarity, likely domain/social availability risks, and 6 strong alternative names. Concise, plain text, no markdown headers.`
        : `Act as a senior brand designer. For "${brand}"${industry ? ` (${industry})` : ""}, propose logo directions: 5 concepts each with concept, style, colour palette (hex), and typography suggestion. Plain text.`;
      const text = await chat(model, "You are a precise brand strategist. Never use em dashes.", prompt);
      if (!text) throw new EngineFailed("OpenAI returned no text.");
      const title = ctx.toolSlug === "brand-name-checker" ? `Name check: ${brand}` : `Logo directions: ${brand}`;
      return {
        title,
        fileName: "openai-report.txt",
        outputFormat: "TXT",
        fileSizeBytes: Buffer.byteLength(text),
        costCents: 1,
        output: { kind: "report", title, text, downloadText: text, mimeType: "text/plain", engine: "openai" },
      };
    }

    // Illustration: text -> image via the Images API (gpt-image-1).
    const prompt = str(ctx.input, "prompt");
    if (!prompt) throw new EngineFailed("Describe the illustration to generate.");
    const style = str(ctx.input, "style");
    const reference = firstImageDataUrl(ctx.input, ["sample"]);
    const fullPrompt = `${prompt}${style ? `. Style: ${style}` : ""}. Professional, clean, brand-ready illustration.${reference ? " Follow the supplied reference sample's look." : ""}`;
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
      body: JSON.stringify({ model: "gpt-image-1", prompt: fullPrompt.slice(0, 4000), size: "1024x1024", n: 1 }),
    });
    if (!res.ok) throw new EngineFailed(`OpenAI image error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new EngineFailed("OpenAI returned no image.");
    const pngDataUrl = `data:image/png;base64,${b64}`;
    const title = prompt.slice(0, 80);
    return {
      title,
      fileName: "illustration.png",
      outputFormat: "PNG",
      fileSizeBytes: Math.round((b64.length * 3) / 4),
      costCents: 4,
      output: { kind: "image", title, pngDataUrl, mimeType: "image/png", engine: "openai" },
    };
  },
};
