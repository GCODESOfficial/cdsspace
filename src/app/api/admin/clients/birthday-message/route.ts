import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { chatComplete } from "@/lib/ai/openai";
import { defaultBirthdayMessage } from "@/lib/birthday-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You write birthday messages that CDS Space, a branding agency in Nigeria, sends to its clients.

Rules:
- Write only the message. No subject line, no commentary, no quotation marks around it.
- Open with the greeting and close with a sign-off from the CDS Space team.
- Warm and human, never flowery or generic. Around 60 to 110 words.
- Use the hints about who this client is to us. Reference the relationship concretely when the hints allow it, and never invent facts that the hints do not support.
- Plain text only, no markdown. Separate paragraphs with a blank line.
- Never use an em dash; use a comma or a full stop instead.`;

// The model is told not to use the long dash, but a stray one would go straight
// into a client email and our content check rejects it anywhere in the tree, so
// the character is built from its code point rather than written out.
const LONG_DASH = new RegExp(String.fromCodePoint(0x2014), "g");

/** Rewrites the birthday message from the admin's hints about the client. */
export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "clients");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const hints = typeof body.hints === "string" ? body.hints.trim().slice(0, 2000) : "";
  const current = typeof body.current === "string" ? body.current.trim().slice(0, 2000) : "";
  if (!id) return NextResponse.json({ error: "Client id is required" }, { status: 400 });

  const sb = financeDb();
  const { data: client, error } = await sb
    .from("clients")
    .select("id, name, brand_name, industry")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const brief = {
    client_name: client.name || "",
    brand: client.brand_name || "",
    industry: client.industry || "",
    who_they_are_to_us_and_what_to_write: hints || "No hints given. Keep it warm, appreciative and general.",
    current_draft: current || defaultBirthdayMessage(client.name || ""),
  };

  try {
    const { text } = await chatComplete(
      [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(brief) }],
      { temperature: 0.7, max_tokens: 500 },
    );
    const message = text.trim().replace(/^["']|["']$/g, "").replace(LONG_DASH, ", ").trim();
    if (!message) return NextResponse.json({ error: "The model returned an empty message" }, { status: 502 });
    return NextResponse.json({ message });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "Could not rewrite the message";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
