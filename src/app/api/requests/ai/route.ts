import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { chatComplete, OpenAIRequestError } from "@/lib/ai/openai";
import sanitizeHtml from "sanitize-html";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const field = body.field === "title" ? "title" : "design brief";
  const value = typeof body.value === "string" ? body.value.trim().slice(0, 10_000) : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 500) : "";
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 60) : "design";
  if (!value) return NextResponse.json({ error: `Add some ${field} content first.` }, { status: 400 });

  try {
    const result = await chatComplete([
      {
        role: "system",
        content: "You help clients prepare clear creative briefs for professional designers. Preserve every factual requirement and brand detail. Improve clarity, structure and production usefulness without inventing claims. Return only the rewritten field. For a title, return one short plain-text line. For a design brief, return concise HTML using only paragraphs and bullet lists.",
      },
      {
        role: "user",
        content: `Field: ${field}\nCategory: ${category}\nClient direction: ${instruction || "Improve this while preserving the intent."}\n\nCurrent content:\n${value}`,
      },
    ], { max_tokens: field === "title" ? 120 : 900, temperature: 0.45, user: session.user.id });
    const text = field === "title"
      ? sanitizeHtml(result.text, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim().slice(0, 180)
      : sanitizeHtml(result.text.trim(), {
          allowedTags: ["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u"],
          allowedAttributes: {},
        }).slice(0, 12_000);
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI assistance is unavailable.";
    return NextResponse.json({ error: message }, { status: error instanceof OpenAIRequestError ? 502 : 500 });
  }
}
