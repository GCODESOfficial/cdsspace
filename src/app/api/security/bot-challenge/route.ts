import { NextRequest, NextResponse } from "next/server";
import {
  createInternalBotChallenge,
  type BotProtectionAction,
} from "@/lib/client-login-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = new Set<BotProtectionAction>([
  "client_login",
  "client_signup",
  "password_reset",
]);

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action") as BotProtectionAction | null;
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: "Invalid security-check action." }, { status: 400 });
  }

  const challenge = await createInternalBotChallenge(action);
  if (!challenge) {
    return NextResponse.json(
      { ok: false, error: "Too many verification requests. Try again later." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }

  return NextResponse.json(
    { ok: true, ...challenge },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
