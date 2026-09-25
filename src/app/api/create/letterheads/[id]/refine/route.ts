import { NextRequest, NextResponse } from "next/server";
import { chatComplete } from "@/lib/ai/openai";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import {
  applyExecutiveBoardIdentity,
  EXECUTIVE_BOARD_IDENTITY,
  getLetterhead,
  sanitizeLetterheadBody,
} from "@/lib/create-platform/letterheads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES: Record<string, string> = {
  improve: "Improve clarity, flow, grammar, and professional credibility while preserving every fact and commitment.",
  formalize: "Make the document appropriately formal and corporate while preserving every fact and commitment.",
  concise: "Make the document concise and direct without removing any material fact or commitment.",
  proofread: "Correct grammar, spelling, punctuation, and awkward phrasing without changing meaning.",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCreateActorFromRequest(req);
  const { id } = await params;
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  if (actor.accessLocked) return NextResponse.json({ error: "Create is not available on client accounts yet." }, { status: 403 });
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid letterhead ID." }, { status: 400 });
  const letterhead = await getLetterhead(actor, id);
  if (!letterhead) return NextResponse.json({ error: "Letterhead not found." }, { status: 404 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const executiveBoard = letterhead.scope === "executive_board";
  const sanitizedHtml = sanitizeLetterheadBody(body.bodyHtml);
  const html = executiveBoard ? applyExecutiveBoardIdentity(sanitizedHtml) : sanitizedHtml;
  if (!html.replace(/<[^>]+>/g, "").trim()) return NextResponse.json({ error: "Write some content before using AI refinement." }, { status: 400 });
  const mode = typeof body.mode === "string" && MODES[body.mode] ? body.mode : "improve";
  try {
    const result = await chatComplete([
      {
        role: "system",
        content: `You are the document editor inside CDS Space cDocs. ${MODES[mode]} Return only safe, clean HTML using p, h1, h2, h3, strong, em, u, ul, ol, li, blockquote, and br tags. Do not add facts, dates, prices, promises, citations, or signatures that were not supplied.${executiveBoard ? ` This is official Executive Board correspondence. The sender is ${EXECUTIVE_BOARD_IDENTITY.senderName}. The company short name is ${EXECUTIVE_BOARD_IDENTITY.companyShort}, and its full formal name is ${EXECUTIVE_BOARD_IDENTITY.companyFull}. Use the full name for formal introductions and legal-style references, and the short name for natural subsequent references. Never output placeholders such as [Your Name], Your Name, [Your Company Name], or Your Company Name.` : " Do not add names that were not supplied."}`,
      },
      { role: "user", content: html },
    ], { temperature: mode === "proofread" ? 0.1 : 0.35, max_tokens: 3500, user: `${actor.kind}:${actor.id}` });
    const refinedHtml = sanitizeLetterheadBody(result.text);
    return NextResponse.json({
      ok: true,
      bodyHtml: executiveBoard ? applyExecutiveBoardIdentity(refinedHtml) : refinedHtml,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI refinement is temporarily unavailable." }, { status: 502 });
  }
}
