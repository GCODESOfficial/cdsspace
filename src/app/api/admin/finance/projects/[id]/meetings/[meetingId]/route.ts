import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; meetingId: string }> },
) {
    const denied = await requireFinanceAdminAsync(req);
    if (denied) return denied;
    const { meetingId } = await params;
    const sb = financeDb();
    const { error } = await sb
        .from("team_meetings")
        .update({ status: "cancelled", ended_at: new Date().toISOString() })
        .eq("id", meetingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
