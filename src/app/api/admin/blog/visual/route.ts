import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { generateImage } from "@/lib/ai/openai";
import { uploadContentHubFile } from "@/lib/content-hub/upload";
import { logActivity } from "@/lib/activity-log";
import { slugify } from "@/lib/blog/constants";
import {
  isBlogChartType,
  isBlogVisualType,
  resolveBlogVisualColors,
  type BlogChartType,
  type BlogVisualType,
} from "@/lib/blog/visual-options";
import {
  buildBlogVisualPrompt,
  parseBlogChartData,
  renderBlogChartSvg,
} from "@/lib/blog/visual-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function canManage(session: AdminSession) {
  return session.role === "super_admin" || hasPermission(session.permissions, "blog");
}

function serverFile(content: BlobPart, fileName: string, type: string) {
  if (typeof File !== "undefined") return new File([content], fileName, { type });
  const blob = new Blob([content], { type }) as File;
  Object.defineProperty(blob, "name", { value: fileName });
  Object.defineProperty(blob, "lastModified", { value: Date.now() });
  return blob;
}

function text(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const location = body.location === "cover" ? "cover" : "inline";
  const brief = text(body.brief, 1200);
  const focus = text(body.focus, 400);
  const articleTitle = text(body.article_title, 220);
  const visualType: BlogVisualType = isBlogVisualType(body.visual_type) ? body.visual_type : "image";
  const chartType: BlogChartType = isBlogChartType(body.chart_type) ? body.chart_type : "bar";
  const visualText = text(body.visual_text, 100);
  const colors = resolveBlogVisualColors(body.palette, body.custom_colors);

  if (!brief) {
    return NextResponse.json({ ok: false, error: "Add a creative brief for the visual." }, { status: 400 });
  }
  if (!focus) {
    return NextResponse.json({ ok: false, error: "Add the visual's main focus." }, { status: 400 });
  }
  if ((visualType === "image_text" || visualType === "infographic") && !visualText) {
    return NextResponse.json({ ok: false, error: "Add the short text that should appear in the visual." }, { status: 400 });
  }

  try {
    const fileStem = slugify(articleTitle || brief).slice(0, 70) || "blog-visual";
    let file: File;
    let model = "deterministic-svg";
    let requestId: string | null = null;

    if (visualType === "chart") {
      const data = parseBlogChartData(body.chart_data);
      if (data.length < 2) {
        return NextResponse.json(
          { ok: false, error: "Add at least two chart values, one per line, using Label: value." },
          { status: 400 },
        );
      }
      if ((chartType === "pie" || chartType === "donut") && data.every((item) => item.value === 0)) {
        return NextResponse.json({ ok: false, error: "Pie and donut charts need at least one value above zero." }, { status: 400 });
      }

      const svg = renderBlogChartSvg({
        title: visualText || brief,
        focus,
        chartType,
        data,
        colors,
        location,
      });
      file = serverFile(svg, `${fileStem}-${chartType}-chart.svg`, "image/svg+xml");
    } else {
      const prompt = buildBlogVisualPrompt({
        location,
        articleTitle,
        brief,
        focus,
        visualType,
        visualText,
        colors,
      });
      const configuredModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
      const image = await generateImage(prompt, {
        model: configuredModel,
        size: location === "cover" && configuredModel.startsWith("gpt-image-2") ? "1536x864" : "1536x1024",
        quality: "medium",
        output_format: "jpeg",
        output_compression: 88,
        background: "opaque",
        user: `blog-visual:${session.email}`,
      });
      model = image.model;
      requestId = image.request_id;
      file = serverFile(image.bytes as unknown as BlobPart, `${fileStem}-${location}.jpg`, image.mime_type);
    }

    const uploaded = await uploadContentHubFile(file, `blog/generated/${location}`);
    const altText = visualType === "chart"
      ? `${visualText || brief} ${chartType} chart`
      : `${focus} - visual for ${articleTitle || "CDS Space article"}`;

    await logActivity({
      action: "blog.visual.generate",
      page: "blog",
      resource_type: "blog_visual",
      resource_id: typeof body.post_id === "string" && body.post_id ? body.post_id : null,
      resource_label: `${location === "cover" ? "Cover" : "Inline"} visual: ${articleTitle || brief}`,
      metadata: {
        location,
        visual_type: visualType,
        chart_type: visualType === "chart" ? chartType : null,
        palette: body.palette || "cds_core",
        model,
        request_id: requestId,
      },
    });

    return NextResponse.json({
      ok: true,
      visual: {
        url: uploaded.url,
        alt_text: altText,
        file_name: uploaded.file_name,
        mime_type: uploaded.mime_type,
        size_bytes: uploaded.size_bytes,
        location,
        visual_type: visualType,
        model,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Visual generation failed." },
      { status: 500 },
    );
  }
}
