/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import {
  generateFromBrief,
  generateFromImage,
  generateFromVideo,
  enhance,
  applyTone,
  generateCta,
  generateHashtags,
  generateVariations,
  bsdPackage,
  DEFAULT_HASHTAGS,
} from "@/lib/content-hub/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Load the Content Hub AI defaults: how many hashtags to generate, and the
 * curated best-performing posts to feed the model as style references. Degrades
 * gracefully to sensible defaults if the columns/row don't exist yet.
 */
async function loadAiDefaults(): Promise<{ hashtags: number; exemplars: string }> {
  try {
    const row = await glashMaybeOne<any>(`select default_hashtags, best_examples from public.content_settings where id = 1`);
    const hashtags = Math.max(0, Math.min(30, parseInt(String(row?.default_hashtags ?? DEFAULT_HASHTAGS), 10) || DEFAULT_HASHTAGS));
    const list = Array.isArray(row?.best_examples) ? row.best_examples : [];
    const exemplars = list
      .slice(0, 8)
      .map((e: any, i: number) => {
        const text = (typeof e === "string" ? e : e?.text || "").trim();
        if (!text) return "";
        const platform = typeof e === "object" ? String(e?.platform || "").trim() : "";
        const note = typeof e === "object" ? String(e?.note || "").trim() : "";
        return `Example ${i + 1}${platform ? ` (${platform})` : ""}:\n${text}${note ? `\n[why it performed: ${note}]` : ""}`;
      })
      .filter(Boolean)
      .join("\n\n");
    return { hashtags, exemplars };
  } catch {
    return { hashtags: DEFAULT_HASHTAGS, exemplars: "" };
  }
}

// POST /api/admin/content-hub/ai  { action, ...payload }
export async function POST(req: NextRequest) {
  const { deny } = await requireContentHub("content_hub.ai");
  if (deny) return deny;

  const body = await req.json().catch(() => ({}));
  const action = str(body.action);

  try {
    const defaults = await loadAiDefaults();

    switch (action) {
      case "generate": {
        if (!str(body.topic)) return NextResponse.json({ ok: false, error: "Topic is required." }, { status: 400 });
        const text = await generateFromBrief({
          topic: str(body.topic),
          audience: str(body.audience),
          platform: str(body.platform),
          tone: str(body.tone),
          objective: str(body.objective),
          exemplars: defaults.exemplars,
        });
        return NextResponse.json({ ok: true, result: text });
      }
      case "from_image": {
        if (!str(body.imageUrl)) return NextResponse.json({ ok: false, error: "Upload an image first." }, { status: 400 });
        const text = await generateFromImage({ imageUrl: str(body.imageUrl), note: str(body.note), platform: str(body.platform), hashtags: defaults.hashtags, exemplars: defaults.exemplars });
        return NextResponse.json({ ok: true, result: text });
      }
      case "from_video": {
        if (!str(body.videoUrl)) return NextResponse.json({ ok: false, error: "Upload a video first." }, { status: 400 });
        const text = await generateFromVideo({ videoUrl: str(body.videoUrl), note: str(body.note), platform: str(body.platform), hashtags: defaults.hashtags, exemplars: defaults.exemplars });
        return NextResponse.json({ ok: true, result: text });
      }
      case "enhance": {
        if (!str(body.content)) return NextResponse.json({ ok: false, error: "There's no content to enhance yet." }, { status: 400 });
        const text = await enhance(str(body.kind), str(body.content), str(body.tone), defaults.exemplars);
        return NextResponse.json({ ok: true, result: text });
      }
      case "tone": {
        if (!str(body.content)) return NextResponse.json({ ok: false, error: "There's no content to restyle." }, { status: 400 });
        const text = await applyTone(str(body.tone), str(body.content), defaults.exemplars);
        return NextResponse.json({ ok: true, result: text });
      }
      case "cta": {
        const text = await generateCta(str(body.content), str(body.kind));
        return NextResponse.json({ ok: true, result: text });
      }
      case "hashtags": {
        // The wizard can request a specific count; otherwise use the configured default.
        const count = Number(body.count) > 0 ? Math.min(30, Math.floor(Number(body.count))) : defaults.hashtags;
        const tags = await generateHashtags(str(body.content), count);
        return NextResponse.json({ ok: true, result: tags });
      }
      case "variations": {
        const variations = await generateVariations(str(body.content), Math.min(5, Math.max(2, Number(body.count) || 3)));
        return NextResponse.json({ ok: true, result: variations });
      }
      case "bsd_package": {
        if (!str(body.note)) return NextResponse.json({ ok: false, error: "Describe what the BSD video covers." }, { status: 400 });
        const pkg = await bsdPackage({ note: str(body.note), videoUrl: str(body.videoUrl) });
        return NextResponse.json({ ok: true, result: pkg });
      }
      default:
        return NextResponse.json({ ok: false, error: "Unknown AI action." }, { status: 400 });
    }
  } catch (err: any) {
    const message = err?.message || "AI request failed.";
    const status = typeof err?.status === "number" ? err.status : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
