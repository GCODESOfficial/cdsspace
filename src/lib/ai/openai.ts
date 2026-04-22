/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Minimal OpenAI Chat Completions client — no SDK. Keeps the bundle
 * lean and lets us stream responses via plain `fetch` + ReadableStream.
 *
 * Requires env:
 *   OPENAI_API_KEY        — required
 *   OPENAI_ORGANIZATION   — optional
 *   OPENAI_DEFAULT_MODEL  — optional, defaults to "gpt-4o-mini"
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  response_format?: { type: "text" | "json_object" };
  user?: string; // stable per-member hash for OpenAI abuse monitoring
}

const DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL || "gpt-4o-mini";

function authHeaders() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const h: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (process.env.OPENAI_ORGANIZATION) h["OpenAI-Organization"] = process.env.OPENAI_ORGANIZATION;
  return h;
}

/** One-shot completion — returns the text + token usage. */
export async function chatComplete(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<{ text: string; prompt_tokens: number; completion_tokens: number; model: string }> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.max_tokens ?? 1200,
      top_p: opts.top_p,
      response_format: opts.response_format,
      user: opts.user,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    prompt_tokens: json.usage?.prompt_tokens ?? 0,
    completion_tokens: json.usage?.completion_tokens ?? 0,
    model: json.model ?? opts.model ?? DEFAULT_MODEL,
  };
}

/** Server-sent-events stream — yields the incremental text chunks. */
export async function chatStream(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.max_tokens ?? 1200,
      top_p: opts.top_p,
      stream: true,
      user: opts.user,
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 500)}`);
  }

  // Rewrite OpenAI's SSE into plain text chunks for the browser.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            controller.close();
            return;
          }
          try {
            const parsed = JSON.parse(payload);
            const delta: string | undefined = parsed.choices?.[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          } catch {
            /* ignore partial frames */
          }
        }
      }
      controller.close();
    },
  });
}
