import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { glashPool } from "@/lib/glashdb/postgres";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANCELLABLE_STATUSES = new Set(["AWAITING_QUOTE", "AWAITING_PAYMENT"]);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid banner order" }, { status: 400 });
  }

  const client = await glashPool.connect();
  try {
    await client.query("begin");
    const bannerResult = await client.query<{
      id: string;
      display_id: string;
      status: string;
      invoice_id: string | null;
    }>(
      `select id, display_id, status::text, invoice_id
         from public.banner_requests
        where id = $1 and user_id = $2
        for update`,
      [id, session.user.id],
    );
    const banner = bannerResult.rows[0];

    if (!banner) {
      await client.query("rollback");
      return NextResponse.json({ error: "Banner order not found" }, { status: 404 });
    }
    if (!CANCELLABLE_STATUSES.has(banner.status)) {
      await client.query("rollback");
      return NextResponse.json(
        { error: "Only an unpaid banner order can be cancelled." },
        { status: 409 },
      );
    }

    if (banner.invoice_id) {
      const invoiceResult = await client.query<{ status: string }>(
        "select status from public.finance_invoices where id = $1 for update",
        [banner.invoice_id],
      );
      const invoiceStatus = invoiceResult.rows[0]?.status?.toLowerCase();
      if (invoiceStatus === "paid") {
        await client.query("rollback");
        return NextResponse.json(
          { error: "This invoice is already paid, so the order cannot be cancelled." },
          { status: 409 },
        );
      }

      const paymentResult = await client.query<{ exists: boolean }>(
        `select exists(
           select 1
             from public.invoice_payment_submissions
            where invoice_id = $1 and status in ('pending', 'confirmed')
         ) as exists`,
        [banner.invoice_id],
      );
      if (paymentResult.rows[0]?.exists) {
        await client.query("rollback");
        return NextResponse.json(
          { error: "A payment is being reviewed for this invoice. Contact CDS Space before cancelling." },
          { status: 409 },
        );
      }

      await client.query(
        `update public.finance_invoices
            set status = 'cancelled', updated_at = now()
          where id = $1 and lower(status) <> 'paid'`,
        [banner.invoice_id],
      );
    }

    await client.query(
      `update public.banner_requests
          set status = 'CANCELLED', updated_at = now()
        where id = $1`,
      [banner.id],
    );
    await client.query(
      `insert into public.status_updates
        (entity_type, entity_id, previous_status, new_status, note, updated_by)
       values ('banner_request', $1, $2, 'CANCELLED', 'Cancelled by the client before payment.', $3)`,
      [banner.id, banner.status, session.user.email || session.user.id],
    );
    await client.query("commit");

    return NextResponse.json({
      success: true,
      banner: { id: banner.id, display_id: banner.display_id, status: "CANCELLED" },
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error("API Error [banner cancellation]:", error);
    return NextResponse.json({ error: "The order could not be cancelled." }, { status: 500 });
  } finally {
    client.release();
  }
}
