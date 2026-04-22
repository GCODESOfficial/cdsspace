/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";
import { buildMessages, RECIPES, type AIKind } from "@/lib/ai/prompts";
import { chatComplete, chatStream } from "@/lib/ai/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

async function resolveActor() {
  const admin = await getAdminSession();
  if (admin) return { kind: "admin" as const, id: null as string | null };
  const team = await getTeamSession();
  if (team) return { kind: "team" as const, id: team.id };
  return { kind: "public" as const, id: null as string | null };
}

async function loadSettings() {
  if (!supabaseAdmin) return null;
  const db = supabaseAdmin as any;
  const { data } = await db.from("ai_settings").select("*").eq("id", 1).maybeSingle();
  return data;
}

async function dailyTokensUsed(): Promise<number> {
  if (!supabaseAdmin) return 0;
  const db = supabaseAdmin as any;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { data } = await db
    .from("ai_usage_log")
    .select("prompt_tokens, completion_tokens")
    .gte("created_at", since.toISOString());
  return (data || []).reduce(
    (s: number, r: any) => s + (r.prompt_tokens || 0) + (r.completion_tokens || 0),
    0
  );
}

async function logUsage(row: {
  kind: string;
  actor_kind: "admin" | "team" | "public";
  actor_id: string | null;
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms?: number;
  status?: "ok" | "error" | "rate_limited" | "unauthorized";
  error?: string;
  input_excerpt?: string;
  output_excerpt?: string;
}) {
  if (!supabaseAdmin) return;
  const db = supabaseAdmin as any;
  await db.from("ai_usage_log").insert(row);
}

function categoriesForKind(kind: AIKind): string[] {
  if (kind.startsWith("resume_")) return ["resume", "custom"];
  if (kind.startsWith("cdocs_")) return ["cdocs", "custom"];
  if (kind.startsWith("role_") || kind === "application_reply") return ["role", "custom"];
  if (kind.startsWith("chat_")) return ["chat", "custom"];
  if (kind === "project_doc_draft" || kind === "protect_doc_description") return ["project", "custom"];
  return ["custom"];
}

async function loadKnowledgeContext(kind: AIKind): Promise<string> {
  if (!supabaseAdmin) return "";
  try {
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from("ai_knowledge_documents")
      .select("title, category, description, tags, content_excerpt")
      .eq("is_active", true)
      .in("category", categoriesForKind(kind))
      .order("updated_at", { ascending: false })
      .limit(6);

    if (error || !data?.length) return "";

    let remaining = 4000;
    const parts: string[] = [];
    for (const doc of data) {
      const block = [
        `Title: ${doc.title}`,
        `Category: ${doc.category}`,
        doc.description ? `Description: ${doc.description}` : "",
        Array.isArray(doc.tags) && doc.tags.length ? `Tags: ${doc.tags.join(", ")}` : "",
        doc.content_excerpt ? `Excerpt: ${doc.content_excerpt}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      if (!block) continue;
      const clipped = block.slice(0, Math.max(0, remaining));
      if (!clipped) break;
      parts.push(clipped);
      remaining -= clipped.length;
      if (remaining <= 0) break;
    }
    return parts.join("\n\n---\n\n");
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const body = await req.json();
    const kind = body?.kind as AIKind | undefined;
    const input = (body?.input ?? {}) as Record<string, any>;
    const stream = !!body?.stream;

    if (!kind || !(kind in RECIPES)) {
      return NextResponse.json({ ok: false, error: "Unknown kind" }, { status: 400 });
    }

    const recipe = RECIPES[kind];
    const settings = await loadSettings();

    if (settings && settings.enabled === false) {
      return NextResponse.json({ ok: false, error: "AI is disabled for this site" }, { status: 503 });
    }

    const actor = await resolveActor();
    if (actor.kind === "team" && settings && settings.allow_team === false) {
      return NextResponse.json({ ok: false, error: "AI access is disabled for team" }, { status: 403 });
    }
    if (actor.kind === "public" && !(settings?.allow_public)) {
      return NextResponse.json({ ok: false, error: "Sign-in required" }, { status: 401 });
    }

    if (settings?.daily_token_cap && settings.daily_token_cap > 0) {
      const used = await dailyTokensUsed();
      if (used >= settings.daily_token_cap) {
        await logUsage({
          kind,
          actor_kind: actor.kind,
          actor_id: actor.id,
          status: "rate_limited",
          error: `Daily token cap hit (${used}/${settings.daily_token_cap})`,
        });
        return NextResponse.json({ ok: false, error: "Daily AI quota reached. Try again tomorrow." }, { status: 429 });
      }
    }

    const knowledgeContext = await loadKnowledgeContext(kind);
    const messages = buildMessages(kind, {
      ...input,
      knowledge_context: knowledgeContext,
    });
    const opts = {
      model: settings?.default_model || undefined,
      temperature: recipe.temperature,
      max_tokens: recipe.max_tokens,
      response_format: recipe.json ? ({ type: "json_object" as const }) : undefined,
      user: actor.id || undefined,
    };

    const inputExcerpt = JSON.stringify(input).slice(0, 400);

    if (stream) {
      // Streaming endpoint — can't log tokens accurately without a second call.
      // Log a best-effort OK row and let the client show the text live.
      const body = await chatStream(messages, opts);
      logUsage({
        kind,
        actor_kind: actor.kind,
        actor_id: actor.id,
        model: opts.model,
        status: "ok",
        latency_ms: Date.now() - started,
        input_excerpt: inputExcerpt,
        output_excerpt: "(streamed)",
      });
      return new Response(body, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const result = await chatComplete(messages, opts);
    await logUsage({
      kind,
      actor_kind: actor.kind,
      actor_id: actor.id,
      model: result.model,
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      latency_ms: Date.now() - started,
      status: "ok",
      input_excerpt: inputExcerpt,
      output_excerpt: result.text.slice(0, 400),
    });

    // For JSON-shaped recipes, parse and return structured
    if (recipe.json) {
      try {
        const parsed = JSON.parse(result.text);
        return NextResponse.json({ ok: true, data: parsed, usage: result });
      } catch {
        return NextResponse.json({ ok: true, text: result.text, usage: result });
      }
    }

    return NextResponse.json({ ok: true, text: result.text, usage: result });
  } catch (err: any) {
    const msg = err?.message || "AI generation failed";
    await logUsage({
      kind: "unknown",
      actor_kind: "public",
      actor_id: null,
      status: "error",
      error: msg.slice(0, 400),
      latency_ms: Date.now() - started,
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
