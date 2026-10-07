/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getChatViewer } from "@/lib/team-chat-auth";
import { readClientDashboardSessionUser } from "@/lib/client-dashboard-session";
import { chatComplete } from "@/lib/ai/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { question, screen: { title, summary, sections, actions, tips, steps, portal }, history, pages }
// pages: the portal's pages the app can open, [{ screen, title }]. The reply is
// { answer, open } where open is one of those screens (an "Open <page>" button) or null.
// The page guide's answer in plain words, written by the model from the screen's own
// help text. Only the question, the last few turns of the guide chat and that help text
// are sent: never the person's records, files or what is on their screen.
// Signed-in clients, team members and admins only, and a few questions a minute each.

const LIMIT = 30; // questions
const WINDOW_MS = 10 * 60 * 1000; // per 10 minutes, per person (best effort, per server)
const recent = new Map<string, number[]>();

function allowed(key: string) {
  const now = Date.now();
  const times = (recent.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) return false;
  times.push(now);
  recent.set(key, times);
  if (recent.size > 5000) recent.clear();
  return true;
}

const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const list = (value: unknown, max: number) => (Array.isArray(value) ? value.slice(0, max) : []);

function screenText(screen: any) {
  const lines = [`Screen: ${text(screen?.title, 80)} (${text(screen?.portal, 20) || "app"} portal)`, `Summary: ${text(screen?.summary, 400)}`];
  const sections = list(screen?.sections, 20).map((s: any) => `- ${text(s?.label, 60)}: ${text(s?.purpose, 240)}`);
  if (sections.length) lines.push(`Sections:\n${sections.join("\n")}`);
  const actions = list(screen?.actions, 20).map((a: any) => {
    const steps = list(a?.steps, 8).map((step: any, i: number) => `${i + 1}. ${text(step, 160)}`).join(" ");
    return `- ${text(a?.label, 60)}: ${text(a?.purpose, 240)}${steps ? ` Steps: ${steps}` : ""}`;
  });
  if (actions.length) lines.push(`Actions:\n${actions.join("\n")}`);
  const steps = list(screen?.steps, 6).map((s: any) => `- ${text(s, 200)}`);
  if (steps.length) lines.push(`Recommended order:\n${steps.join("\n")}`);
  const tips = list(screen?.tips, 8).map((t: any) => `- ${text(t, 240)}`);
  if (tips.length) lines.push(`Tips:\n${tips.join("\n")}`);
  return lines.join("\n");
}

const SYSTEM = [
  "You are the CDS Space page guide inside the CDS Space app (a branding agency's client, team and admin workspace).",
  "Help the person use the screen they are on, using only the screen guide below. Do not invent buttons, menus, prices or policies that are not in it.",
  "Style: friendly, plain and brief, like a helpful colleague. Usually 1 to 4 short sentences. When giving steps, put each numbered step on its own line. No markdown headings, no bold, no emojis.",
  "For greetings or small talk, reply in one short line and offer to help with something on this screen.",
  "If the guide doesn't cover the question, say so honestly in one sentence and suggest what this screen can help with, or which part of the app might.",
  "You cannot see or change the person's records, messages, files or account; say so if they ask you to look something up or do it for them.",
  "Never ask for or repeat passwords, codes, card or bank details.",
  'Reply only with JSON: {"answer": "<your reply>", "open": "<page id or null>"}.',
  'Set "open" to the id of the page from the page list where the person does what they asked about (for example the attendance page for checking in), so the app can offer an "Open" button. Use null for small talk, or when no listed page fits. Never invent an id.',
].join("\n");

// "Steps: 1. Choose X 2. Allow Y" -> one step per line, should the model run them together.
const stepLines = (value: string) => value.replace(/\s+(?=\d{1,2}\.\s)/g, "\n").trim();

export async function POST(req: Request) {
  const viewer = await getChatViewer().catch(() => null);
  const client = viewer ? null : await readClientDashboardSessionUser().catch(() => null);
  const who = viewer ? (viewer.kind === "team" ? `team:${viewer.session.id}` : `admin:${(viewer as any).email || "admin"}`) : client ? `client:${(client as any).id}` : null;
  if (!who) return NextResponse.json({ ok: false, error: "Sign in to use the guide." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: false, error: "The guide's AI is not set up." }, { status: 503 });
  if (!allowed(who)) return NextResponse.json({ ok: false, error: "That's a lot of questions at once. Try again in a few minutes." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const question = text(body?.question, 500);
  if (!question) return NextResponse.json({ ok: false, error: "question required" }, { status: 400 });

  const pages = list(body?.pages, 80)
    .map((page: any) => ({ screen: text(page?.screen, 60), title: text(page?.title, 80) }))
    .filter((page) => /^[A-Za-z]+$/.test(page.screen) && page.title);
  const pageList = pages.length ? pages.map((page) => `${page.screen}: ${page.title}`).join("\n") : "(none)";

  const history = list(body?.history, 6)
    .map((turn: any) => ({ role: turn?.role === "guide" ? ("assistant" as const) : ("user" as const), content: text(turn?.text, 800) }))
    .filter((turn) => turn.content);

  try {
    const { text: reply } = await chatComplete(
      [
        { role: "system", content: `${SYSTEM}\n\nScreen guide:\n${screenText(body?.screen)}\n\nPages (id: title):\n${pageList}` },
        ...history,
        { role: "user", content: question },
      ],
      { temperature: 0.3, max_tokens: 400, user: who, response_format: { type: "json_object" } },
    );
    let parsed: any = null;
    try {
      parsed = JSON.parse(reply);
    } catch {
      parsed = { answer: reply, open: null };
    }
    const answer = stepLines(String(parsed?.answer || "").replace(/\*\*/g, ""));
    if (!answer) throw new Error("empty");
    // Only a page from the app's own list: never a made-up screen.
    const open = pages.find((page) => page.screen === parsed?.open) || null;
    return NextResponse.json({ ok: true, answer, open });
  } catch {
    return NextResponse.json({ ok: false, error: "The guide couldn't answer just now." }, { status: 502 });
  }
}
