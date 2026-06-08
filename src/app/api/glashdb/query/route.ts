import { NextRequest, NextResponse } from "next/server";
import { executeGlashQueryPayload } from "@/lib/glashdb/query-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ data: null, error: { message: "Invalid Glash query payload." } }, { status: 400 });
  }

  const result = await executeGlashQueryPayload(payload);
  return NextResponse.json(result, { status: result.error ? 400 : 200 });
}
