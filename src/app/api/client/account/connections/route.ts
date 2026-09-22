import { NextResponse } from "next/server";
import { readClientDashboardSession } from "@/lib/client-dashboard-session";
import {
  listClientAuthConnections,
  syncNativeClientConnections,
} from "@/lib/auth/client-account-connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readClientDashboardSession();
  if (!session) {
    return NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await syncNativeClientConnections(session.subject);
    const connections = await listClientAuthConnections(session.subject);
    return NextResponse.json({ connections }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[client-auth] connection list failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Connected sign-in accounts could not be loaded." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
