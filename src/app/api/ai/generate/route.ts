/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";
import { buildMessages, RECIPES, type AIKind } from "@/lib/ai/prompts";
import { chatComplete, chatStream, OpenAIRequestError } from "@/lib/ai/openai";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

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
  try {
    return await glashMaybeOne<any>("select * from public.ai_settings where id = 1 limit 1");
  } catch {
    return null;
  }
}

async function dailyTokensUsed(): Promise<number> {
  try {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const row = await glashMaybeOne<{ total_tokens: string | number | null }>(
      `select coalesce(sum(coalesce(prompt_tokens, 0) + coalesce(completion_tokens, 0)), 0) as total_tokens
       from public.ai_usage_log
       where created_at >= $1`,
      [since.toISOString()],
    );
    return Number(row?.total_tokens || 0);
  } catch {
    return 0;
  }
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
  try {
    await glashQuery(
      `insert into public.ai_usage_log
        (kind, actor_kind, actor_id, model, prompt_tokens, completion_tokens, latency_ms,
         status, error, input_excerpt, output_excerpt)
       values ($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        row.kind,
        row.actor_kind,
        row.actor_id,
        row.model || null,
        row.prompt_tokens ?? null,
        row.completion_tokens ?? null,
        row.latency_ms ?? null,
        row.status || "ok",
        row.error || null,
        row.input_excerpt || null,
        row.output_excerpt || null,
      ],
    );
  } catch {
    /* Logging must not block AI-assisted form work. */
  }
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
  try {
    const data = await glashQuery<any>(
      `select title, category, description, tags, content_excerpt
       from public.ai_knowledge_documents
       where is_active = true
         and category = any($1::text[])
       order by updated_at desc
       limit 6`,
      [categoriesForKind(kind)],
    );
    if (!data?.length) return "";

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
  let actor: Awaited<ReturnType<typeof resolveActor>> = { kind: "public", id: null };
  let kindForLog = "unknown";
  try {
    const body = await req.json();
    const kind = body?.kind as AIKind | undefined;
    const input = (body?.input ?? {}) as Record<string, any>;
    const stream = !!body?.stream;

    if (!kind || !(kind in RECIPES)) {
      return NextResponse.json({ ok: false, error: "Unknown kind" }, { status: 400 });
    }
    kindForLog = kind;

    const recipe = RECIPES[kind];
    const settings = await loadSettings();

    if (settings && settings.enabled === false) {
      return NextResponse.json({ ok: false, error: "AI is disabled for this site" }, { status: 503 });
    }

    actor = await resolveActor();
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
    const isOpenAIError = err instanceof OpenAIRequestError;
    const status = isOpenAIError && err.status === 429 ? 429 : isOpenAIError ? 502 : 500;
    const logStatus =
      isOpenAIError && err.status === 429
        ? "rate_limited"
        : isOpenAIError && (err.status === 401 || err.status === 403)
        ? "unauthorized"
        : "error";
    await logUsage({
      kind: kindForLog,
      actor_kind: actor.kind,
      actor_id: actor.id,
      status: logStatus,
      error: msg.slice(0, 400),
      latency_ms: Date.now() - started,
    });
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
