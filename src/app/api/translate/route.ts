import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same engine cdslabs uses: OpenAI gpt-4o-mini for high-quality UI translation,
// fronted by a shared DB cache so repeat strings are instant and cheap. No
// self-hosted container. If the key/engine is unavailable we return the English
// source and the client falls back to the free MyMemory API.
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

const LANG_NAMES: Record<string, string> = {
  en: "English", fr: "French", es: "Spanish", pt: "Portuguese", de: "German",
  ar: "Arabic", zh: "Chinese", ru: "Russian", nl: "Dutch",
};

const hash = (s: string) => createHash("md5").update(s).digest("hex");

async function callOpenAI(texts: string[], targetLanguage: string): Promise<string[] | null> {
  if (!OPENAI_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a precise product UI translator for CDS Space.",
              "Translate every user-facing phrase naturally into the target language.",
              "Preserve brand/product names, URLs, emails, numbers, emoji, variables like {name}, and code identifiers.",
              "Return only valid JSON with a translations array in the same order and length as the input texts.",
            ].join(" "),
          },
          { role: "user", content: JSON.stringify({ targetLanguage, texts }) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
    return Array.isArray(parsed?.translations) ? parsed.translations : null;
  } catch {
    return null;
  }
}

/**
 * Body: { q | texts: string[], target | targetLocale: string, targetLanguage?, source? }
 * Returns: { translations: string[] } aligned to the input order.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const source = String(body?.source || "en");
  const target = String(body?.target || body?.targetLocale || "");
  const targetLanguage = String(body?.targetLanguage || LANG_NAMES[target] || target);
  const input: string[] = Array.isArray(body?.q) ? body.q : Array.isArray(body?.texts) ? body.texts : [];
  const q = input.map((x: unknown) => String(x));

  if (!target || target === source || q.length === 0) {
    return NextResponse.json({ translations: q });
  }

  const unique = Array.from(new Set(q.filter((s) => s.trim().length > 0)));
  const result = new Map<string, string>();

  // 1) Shared DB cache.
  const hashes = unique.map(hash);
  if (hashes.length) {
    const cached = await glashQuery<{ text_hash: string; translated_text: string }>(
      `select text_hash, translated_text from public.translation_memory
        where target_lang = $1 and text_hash = any($2::text[])`,
      [target, hashes],
    ).catch(() => []);
    const byHash = new Map(cached.map((r) => [r.text_hash, r.translated_text]));
    for (const s of unique) {
      const t = byHash.get(hash(s));
      if (t !== undefined) result.set(s, t);
    }
  }

  // 2) Translate misses via OpenAI, then persist to the shared cache.
  const misses = unique.filter((s) => !result.has(s));
  if (misses.length) {
    const out = await callOpenAI(misses, targetLanguage);
    if (out) {
      for (let i = 0; i < misses.length; i += 1) {
        const tr = out[i];
        if (typeof tr === "string" && tr.trim()) {
          result.set(misses[i], tr);
          await glashQuery(
            `insert into public.translation_memory (source_lang, target_lang, text_hash, source_text, translated_text)
             values ($1,$2,$3,$4,$5)
             on conflict (target_lang, text_hash) do nothing`,
            [source, target, hash(misses[i]), misses[i], tr],
          ).catch(() => []);
        }
      }
    }
  }

  return NextResponse.json({ translations: q.map((s) => result.get(s) ?? s) });
}
