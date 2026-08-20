import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { chatComplete } from "@/lib/ai/openai";
import { slugify, BLOG_CATEGORIES } from "@/lib/blog/constants";
import { assertTrustedMutationOrigin, cleanText, sanitizeIntelligenceHtml } from "@/lib/intelligence/security";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";

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
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  if (!checkIntelligenceRateLimit(`intelligence-ai:${session.email}`, 12, 60 * 60_000).allowed) {
    return NextResponse.json({ ok: false, error: "AI assistance limit reached for this hour." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const title = cleanText(body?.title, 220);
  if (!title) return NextResponse.json({ ok: false, error: "Add an article title first - the AI writes everything else from it." }, { status: 400 });
  const category = BLOG_CATEGORIES.includes(body?.category) ? body.category : "Branding";
  const tone = cleanText(body?.tone, 100) || "professional, analytical, evidence-led, and confident";
  const publicationType = cleanText(body?.publicationType, 100) || "Executive Insight";

  const system = [
    "You are the senior content writer for CDS Space, a full-service branding agency.",
    "Voice: clear, credible, and practical - authority for builders and founders, never fluffy or generic.",
    "You assist a human research editor drafting a CDS Space Intelligence publication. Never invent sources, statistics, quotes, or findings.",
    "Return STRICT JSON only, matching this TypeScript type:",
    "{ slug: string; subtitle: string; excerpt: string; executive_summary: string; content: string; seo_title: string; seo_description: string; tags: string[] }",
    "Rules:",
    "- slug: short kebab-case derived from the title.",
    "- subtitle: one compelling sentence (<= 120 chars).",
    "- excerpt: 1–2 sentence summary for cards/social (<= 200 chars).",
    "- executive_summary: 3–5 concise sentences stating the proposed decision context and what evidence the editor still needs to verify.",
    "- content: a rigorous HTML research outline using <h2>, <h3>, <p>, <ul>/<li>, <table>, and <blockquote>. Mark every unverified fact or needed source as [EDITOR TO VERIFY]. No <h1>, inline styles, markdown, or code fences.",
    "- seo_title: <= 60 chars. seo_description: <= 160 chars.",
    "- tags: 4–6 lowercase topical tags.",
    "End with suggested research questions and a short, relevant CTA. This is an editable draft, never a publish-ready approval.",
  ].join("\n");

  const user = `Title: ${title}\nPublication type: ${publicationType}\nCategory: ${category}\nTone: ${tone}`;

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
        executive_summary: asString(parsed.executive_summary),
        content: sanitizeIntelligenceHtml(asString(parsed.content)),
        seo_title: asString(parsed.seo_title) || title,
        seo_description: asString(parsed.seo_description) || asString(parsed.excerpt),
        tags,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "AI request failed" }, { status: 500 });
  }
}
