import { CreateEngineImpl, EngineFailed, EngineResult, EngineRunContext, EngineUnavailable, firstImageDataUrl } from "./types";

// The Internal CREATE brain: self-hosted, zero marginal cost, always the final
// fallback. It runs real CPU work (image enhancement via sharp, logo animation
// via SVG/SMIL) and gains capabilities trained from our own first-party samples
// so the paid brains are called less and less over time.

const SELF_HOSTED_TOOLS = new Set(["image-restorer", "logo-animation"]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Build an animated SVG that plays the chosen intro on the uploaded logo. */
function logoAnimationSvg(logoDataUrl: string, preset: string): string {
  const p = (preset || "Reveal").toLowerCase();
  const href = esc(logoDataUrl);
  const img = (extra: string) => `<image href="${href}" x="160" y="160" width="480" height="480" preserveAspectRatio="xMidYMid meet" ${extra}/>`;
  const anims: Record<string, string> = {
    fade: img(`opacity="0"><animate attributeName="opacity" from="0" to="1" dur="1s" fill="freeze"/></image>`),
    scale: `<g transform-origin="400 400">${img(`opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.8s" fill="freeze"/><animateTransform attributeName="transform" type="scale" from="0.5" to="1" dur="0.8s" additive="sum" fill="freeze"/></image>`)}</g>`,
    rotation: `<g transform-origin="400 400">${img(`opacity="0"><animate attributeName="opacity" from="0" to="1" dur="1s" fill="freeze"/><animateTransform attributeName="transform" type="rotate" from="-180" to="0" dur="1s" additive="sum" fill="freeze"/></image>`)}</g>`,
    reveal: `<clipPath id="wipe"><rect x="160" y="160" width="480" height="480"><animate attributeName="width" from="0" to="480" dur="0.9s" fill="freeze"/></rect></clipPath><g clip-path="url(#wipe)">${img("")}</g>`,
    glow: `<defs><filter id="g"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${img(`filter="url(#g)"><animate attributeName="opacity" values="0.65;1;0.65" dur="2.2s" repeatCount="indefinite"/></image>`)}`,
  };
  const chosen = anims[p]
    || (p === "draw" || p === "morph" ? anims.reveal
      : p === "particle" ? anims.glow
      : p === "rotation" ? anims.rotation
      : p === "minimal" || p === "corporate" ? anims.fade
      : anims.scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="#FFFFFF"/>${chosen}</svg>`;
}

export const internalEngine: CreateEngineImpl = {
  key: "internal",
  label: "Internal CREATE brain",
  isConfigured: () => true,
  handles: (toolSlug) => SELF_HOSTED_TOOLS.has(toolSlug),
  async run(ctx: EngineRunContext): Promise<EngineResult> {
    if (ctx.toolSlug === "image-restorer") {
      const image = firstImageDataUrl(ctx.input, ["image", "source"]);
      if (!image) throw new EngineFailed("Upload an image to enhance.");
      const raw = Buffer.from(image.split(",")[1] || "", "base64");
      if (!raw.length) throw new EngineFailed("Could not read the uploaded image.");
      const sharp = (await import("sharp")).default;
      const meta = await sharp(raw).metadata();
      const factor = ctx.input.target === "2K" ? 2 : 2;
      const width = Math.min((meta.width || 1024) * factor, 4096);
      const out = await sharp(raw).resize({ width, withoutEnlargement: false }).sharpen({ sigma: 1 }).png().toBuffer();
      const pngDataUrl = `data:image/png;base64,${out.toString("base64")}`;
      return {
        title: "Enhanced image", fileName: "enhanced.png", outputFormat: "PNG", fileSizeBytes: out.length, costCents: 0,
        output: { kind: "image", title: "Enhanced image", pngDataUrl, mimeType: "image/png", engine: "internal" },
      };
    }

    if (ctx.toolSlug === "logo-animation") {
      const logo = firstImageDataUrl(ctx.input, ["logo"]);
      if (!logo) throw new EngineFailed("Upload a logo (PNG or SVG) to animate.");
      const preset = typeof ctx.input.preset === "string" ? ctx.input.preset : "Reveal";
      const svg = logoAnimationSvg(logo, preset);
      return {
        title: `Animated logo (${preset})`, fileName: "logo-animation.svg", outputFormat: "SVG", fileSizeBytes: Buffer.byteLength(svg), costCents: 0,
        output: {
          kind: "visual", title: `Animated logo (${preset})`, svg,
          dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
          downloadText: svg, mimeType: "image/svg+xml", engine: "internal", animated: true,
        },
      };
    }

    throw new EngineUnavailable(`Internal brain has no capability for ${ctx.toolSlug} yet.`);
  },
};
