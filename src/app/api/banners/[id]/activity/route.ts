import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ActivityItem = { id: string; title: string; detail: string | null; actor: string; occurredAt: string; kind: string };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Invalid banner order" }, { status: 400 });

  const banner = await glashMaybeOne<{ id: string; display_id: string; status: string; created_at: string; updated_at: string; invoice_id: string | null }>(
    `select id, display_id, status::text, created_at, updated_at, invoice_id
       from public.banner_requests where id = $1 and user_id = $2 limit 1`,
    [id, session.user.id],
  );
  if (!banner) return NextResponse.json({ error: "Banner order not found" }, { status: 404 });

  const [updates, edits, payments] = await Promise.all([
    glashQuery<{ id: string; previous_status: string; new_status: string; note: string | null; updated_by: string; created_at: string }>(
      `select id, previous_status, new_status, note, updated_by, created_at
         from public.status_updates
        where entity_type = 'banner_request' and entity_id = $1
        order by created_at desc`, [id]),
    glashQuery<{ id: string; status: string; message: string; admin_note: string | null; requested_at: string; reviewed_at: string | null; reviewed_by: string | null }>(
      `select id, status, message, admin_note, requested_at, reviewed_at, reviewed_by
         from public.banner_edit_requests where banner_request_id = $1 order by requested_at desc`, [id]),
    banner.invoice_id ? glashQuery<{ id: string; status: string; submitted_at: string; confirmed_at: string | null }>(
      `select id, status, submitted_at, confirmed_at
         from public.invoice_payment_submissions where invoice_id = $1 order by submitted_at desc`, [banner.invoice_id]) : Promise.resolve([]),
  ]);

  const items: ActivityItem[] = [
    { id: `created-${banner.id}`, title: "Banner order created", detail: `${banner.display_id} entered your workspace.`, actor: "You", occurredAt: banner.created_at, kind: "created" },
    ...updates.map((entry) => ({
      id: entry.id,
      title: entry.previous_status === entry.new_status ? "Order note added" : `Status changed to ${entry.new_status.toLowerCase().replaceAll("_", " ")}`,
      detail: entry.note,
      actor: entry.updated_by === session.user.email || entry.updated_by === session.user.id ? "You" : "CDS Space",
      occurredAt: entry.created_at,
      kind: "status",
    })),
    ...edits.flatMap((entry) => {
      const result: ActivityItem[] = [{ id: `edit-${entry.id}`, title: "Edit requested", detail: entry.message, actor: "You", occurredAt: entry.requested_at, kind: "edit" }];
      if (entry.reviewed_at) result.push({ id: `review-${entry.id}`, title: entry.status === "resolved" ? "Edit request completed" : entry.status === "declined" ? "Edit request closed" : "Edit request reviewed", detail: entry.admin_note, actor: "CDS Space", occurredAt: entry.reviewed_at, kind: "edit_review" });
      return result;
    }),
    ...payments.flatMap((entry) => {
      const result: ActivityItem[] = [{ id: `payment-${entry.id}`, title: "Bank transfer submitted", detail: "Your payment was safely recorded for finance review.", actor: "You", occurredAt: entry.submitted_at, kind: "payment" }];
      if (entry.confirmed_at) result.push({ id: `confirmed-${entry.id}`, title: "Payment confirmed", detail: "Finance verified the transfer and issued your receipt.", actor: "CDS Space", occurredAt: entry.confirmed_at, kind: "payment" });
      return result;
    }),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return NextResponse.json({ ok: true, banner: { displayId: banner.display_id, status: banner.status }, items });
}
