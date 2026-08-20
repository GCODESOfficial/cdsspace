/**
 * Minimal OpenAI Chat Completions client - no SDK. Keeps the bundle
 * lean and lets us stream responses via plain `fetch` + ReadableStream.
 *
 * Requires env:
 *   OPENAI_API_KEY        - required
 *   OPENAI_ORGANIZATION   - optional
 *   OPENAI_DEFAULT_MODEL  - optional, defaults to "gpt-4o-mini"
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";

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
const DEFAULT_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

export class OpenAIRequestError extends Error {
  status: number;
  code?: string;
  type?: string;
  rawMessage?: string;

  constructor(status: number, message: string, details: { code?: string; type?: string; rawMessage?: string } = {}) {
    super(message);
    this.name = "OpenAIRequestError";
    this.status = status;
    this.code = details.code;
    this.type = details.type;
    this.rawMessage = details.rawMessage;
  }
}

function friendlyOpenAIMessage(status: number, rawMessage: string) {
  if (status === 401 || status === 403) {
    return "OPENAI_API_KEY was rejected. Update the key and restart the app.";
  }
  if (status === 429) {
    if (/quota|billing/i.test(rawMessage)) {
      return "OpenAI quota is exhausted for this key. Check billing or replace OPENAI_API_KEY.";
    }
    return "OpenAI rate limit reached. Please retry shortly.";
  }
  if (status >= 500) {
    return "OpenAI is temporarily unavailable. Please retry shortly.";
  }
  return rawMessage || `OpenAI request failed with status ${status}.`;
}

async function openAIErrorFromResponse(res: Response) {
  const body = await res.text();
  let rawMessage = body.slice(0, 500);
  let code: string | undefined;
  let type: string | undefined;

  try {
    const parsed = JSON.parse(body);
    rawMessage = parsed?.error?.message || rawMessage;
    code = parsed?.error?.code;
    type = parsed?.error?.type;
  } catch {
    /* Plain-text or empty error response. */
  }

  return new OpenAIRequestError(res.status, friendlyOpenAIMessage(res.status, rawMessage), {
    code,
    type,
    rawMessage,
  });
}

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

/** One-shot completion - returns the text + token usage. */
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
    throw await openAIErrorFromResponse(res);
  }

  const json = await res.json();
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    prompt_tokens: json.usage?.prompt_tokens ?? 0,
    completion_tokens: json.usage?.completion_tokens ?? 0,
    model: json.model ?? opts.model ?? DEFAULT_MODEL,
  };
}

export interface ImageGenerationOptions {
  model?: string;
  size?: string;
  quality?: "low" | "medium" | "high" | "auto";
  output_format?: "png" | "jpeg" | "webp";
  output_compression?: number;
  background?: "opaque" | "transparent" | "auto";
  user?: string;
}

/** Generate one image through the Image API and return its durable byte payload. */
export async function generateImage(
  prompt: string,
  opts: ImageGenerationOptions = {},
): Promise<{
  bytes: Uint8Array;
  mime_type: string;
  model: string;
  request_id: string | null;
  usage: unknown;
}> {
  const model = opts.model || DEFAULT_IMAGE_MODEL;
  const outputFormat = opts.output_format || "jpeg";
  const res = await fetch(OPENAI_IMAGE_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: opts.size || "1536x1024",
      quality: opts.quality || "medium",
      output_format: outputFormat,
      output_compression: outputFormat === "png"
        ? undefined
        : Math.max(0, Math.min(100, Math.round(opts.output_compression ?? 88))),
      background: opts.background || "opaque",
      user: opts.user,
    }),
  });

  if (!res.ok) {
    throw await openAIErrorFromResponse(res);
  }

  const json = await res.json();
  const encoded = json.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || !encoded) {
    throw new OpenAIRequestError(502, "OpenAI returned an empty image.");
  }

  return {
    bytes: Uint8Array.from(Buffer.from(encoded, "base64")),
    mime_type: `image/${outputFormat}`,
    model,
    request_id: res.headers.get("x-request-id"),
    usage: json.usage || null,
  };
}

/** Server-sent-events stream - yields the incremental text chunks. */
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
    if (!res.ok) throw await openAIErrorFromResponse(res);
    throw new OpenAIRequestError(502, "OpenAI returned an empty streaming response.");
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
