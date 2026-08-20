import { NextRequest, NextResponse } from "next/server";
import { processClientChatEscalations } from "@/lib/client-chat-escalation";

// Point the production scheduler at this route every minute. When a
// CRON_SECRET is configured, send it as `Authorization: Bearer <secret>`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processClientChatEscalations();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[client-chat-escalations] worker failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Escalation worker failed." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
