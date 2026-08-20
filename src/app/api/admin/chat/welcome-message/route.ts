import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { logActivity } from "@/lib/activity-log";
import { backfillClientWelcomes } from "@/lib/client-welcome";

export const dynamic = "force-dynamic";

const MIN_MESSAGE_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 12_000;

async function readWelcomeMessage() {
  const { data, error } = await financeDb()
    .from("client_chat_welcome_settings")
    .select("id, message, is_active, updated_by, updated_at")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data;
}

export async function GET(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "messages");
  if (denied) return denied;

  try {
    return NextResponse.json({ setting: await readWelcomeMessage() }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not load the client welcome message.",
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "messages");
  if (denied) return denied;

  try {
    const session = await getAdminSessionAsync(request);
    const body = await request.json();
    const message = typeof body.message === "string"
      ? body.message.replace(/\r\n?/g, "\n").trim()
      : "";
    const isActive = body.is_active !== false;

    if (message.length < MIN_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "The welcome message must contain at least 50 characters." }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "The welcome message cannot exceed 12,000 characters." }, { status: 400 });
    }

    const { error } = await financeDb()
      .from("client_chat_welcome_settings")
      .upsert({
        id: 1,
        message,
        is_active: isActive,
        updated_by: session?.email || "admin",
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    if (error) throw error;

    await logActivity({
      action: "client_chat.welcome_message.update",
      page: "clients/chat",
      resource_type: "client_chat_welcome_message",
      resource_id: "1",
      resource_label: isActive ? "Automatic welcome message enabled" : "Automatic welcome message paused",
      metadata: { active: isActive, character_count: message.length },
    });

    return NextResponse.json({ ok: true, setting: await readWelcomeMessage() });
  } catch (error) {
    console.error("[client-chat-welcome] update failed", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not save the client welcome message.",
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "messages");
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    if (body.action !== "backfill") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }
    const result = await backfillClientWelcomes(Number(body.limit) || 250);
    await logActivity({
      action: "client_chat.welcome_message.backfill",
      page: "clients/chat",
      resource_type: "client_chat_welcome_message",
      resource_id: "1",
      resource_label: "Welcome message sent to existing clients",
      metadata: result,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[client-chat-welcome] backfill failed", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not send the welcome message to existing clients.",
    }, { status: 500 });
  }
}
