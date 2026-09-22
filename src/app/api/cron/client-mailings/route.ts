import { NextRequest, NextResponse } from "next/server";
import { deliverClientMailing } from "@/lib/client-mailing-delivery";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && (req.headers.get("authorization") || "") === `Bearer ${secret}`);
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  await glashQuery(
    `update public.client_email_campaigns
        set status='failed', claimed_at=null,
            last_error='Delivery worker stopped before the mailing completed.', updated_at=now()
      where status='sending' and claimed_at < now() - interval '30 minutes'`,
  );

  const due = await glashQuery<{ id: string }>(
    `select id
       from public.client_email_campaigns
      where status='scheduled' and scheduled_for <= now()
      order by scheduled_for asc
      limit 10`,
  );
  const results: Array<{ id: string; ok: boolean; sent?: number; failed?: number; error?: string }> = [];

  for (const campaign of due) {
    try {
      const result = await deliverClientMailing({ campaignId: campaign.id, mode: "scheduled" });
      results.push({ id: campaign.id, ok: true, sent: result.sent_count, failed: result.failed_count });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Scheduled delivery failed.";
      await glashQuery(
        `update public.client_email_campaigns
            set status='failed', claimed_at=null, last_error=$2, updated_at=now()
          where id=$1::uuid and status='scheduled'`,
        [campaign.id, message],
      ).catch(() => []);
      results.push({ id: campaign.id, ok: false, error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    due: due.length,
    delivered: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  });
}
