import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { chatComplete } from "@/lib/ai/openai";
import { slugify, BLOG_CATEGORIES } from "@/lib/blog/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canManage(s: AdminSession) {
  return s.role === "super_admin" || hasPermission(s.permissions, "blog");
}

// POST { title, category?, tone? } → fills the rest of the editor fields.
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const title = String(body?.title || "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "Add an article title first - the AI writes everything else from it." }, { status: 400 });
  const category = BLOG_CATEGORIES.includes(body?.category) ? body.category : "Branding";
  const tone = String(body?.tone || "professional, insightful, and confident");

  const system = [
    "You are the senior content writer for CDS Space, a full-service branding agency.",
    "Voice: clear, credible, and practical - authority for builders and founders, never fluffy or generic.",
    "You write a complete blog post and its metadata from a given title.",
    "Return STRICT JSON only, matching this TypeScript type:",
    "{ slug: string; subtitle: string; excerpt: string; content: string; seo_title: string; seo_description: string; tags: string[] }",
    "Rules:",
    "- slug: short kebab-case derived from the title.",
    "- subtitle: one compelling sentence (<= 120 chars).",
    "- excerpt: 1–2 sentence summary for cards/social (<= 200 chars).",
    "- content: well-structured HTML using <h2>, <h3>, <p>, <ul>/<li>, and <blockquote>. 500–900 words. No <h1>, no inline styles, no markdown, no code fences.",
    "- seo_title: <= 60 chars. seo_description: <= 160 chars.",
    "- tags: 4–6 lowercase topical tags.",
    "End the article with a short call-to-action paragraph inviting readers to work with CDS Space.",
  ].join("\n");

  const user = `Title: ${title}\nCategory: ${category}\nTone: ${tone}`;

  try {
    const { text } = await chatComplete(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { response_format: { type: "json_object" }, temperature: 0.7, max_tokens: 2200, user: `blog-ai:${session.email}` },
    );

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text); } catch {
      return NextResponse.json({ ok: false, error: "The AI returned an unexpected response. Please try again." }, { status: 502 });
    }

    const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8) : [];

    return NextResponse.json({
      ok: true,
      result: {
        slug: slugify(asString(parsed.slug) || title),
        subtitle: asString(parsed.subtitle),
        excerpt: asString(parsed.excerpt),
        content: asString(parsed.content),
        seo_title: asString(parsed.seo_title) || title,
        seo_description: asString(parsed.seo_description) || asString(parsed.excerpt),
        tags,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "AI request failed" }, { status: 500 });
  }
}
