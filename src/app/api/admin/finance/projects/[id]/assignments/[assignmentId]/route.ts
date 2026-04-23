import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
    const denied = requireFinanceAdmin(req);
    if (denied) return denied;
    const { assignmentId } = await params;
    const sb = financeDb();
    const { error } = await sb.from("project_assignments").delete().eq("id", assignmentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
