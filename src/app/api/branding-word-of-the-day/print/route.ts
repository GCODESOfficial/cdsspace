import { NextResponse } from "next/server";
import { ensureWotdPrint, getWotdWordFast } from "@/lib/content-hub/wotd-print";
import { verifyUser } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const session = await verifyUser();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await getWotdWordFast();
    return NextResponse.json(
      { ok: true, date_key: result.date_key, word: result.word },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load today's word." },
      { status: 500 },
    );
  }
}

export async function POST() {
  const session = await verifyUser();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { user } = session;

  try {
    const result = await ensureWotdPrint({
      name: "Client dashboard WOTD",
      id: user.id,
    });
    return NextResponse.json({
      ok: true,
      created: result.created,
      date_key: result.date_key,
      word_id: result.word.id,
      word: result.word,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "WOTD print failed." },
      { status: 500 },
    );
  }
}
