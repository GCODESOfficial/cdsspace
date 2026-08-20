import { NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { glashQuery } from "@/lib/glashdb/postgres";
import { publicDeliveryPath } from "@/lib/delivery-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await glashQuery<{
      id: string;
      title: string;
      description: string | null;
      delivery_type: "brand_identity" | "design";
      published_at: string;
      public_token: string;
      file_count: number;
    }>(
      `select d.id, d.title, d.description, d.delivery_type, d.published_at,
              d.public_token::text,
              coalesce(files.file_count, 0)::int as file_count
         from public.client_deliveries d
         left join lateral (
           select count(*)::int as file_count
             from public.client_delivery_files f
            where f.delivery_id = d.id
         ) files on true
        where d.client_user_id = $1
          and d.status = 'published'
          and d.published_at is not null
          and d.public_access_revoked_at is null
        order by d.published_at desc
        limit 6`,
      [account.user.id],
    );

    return NextResponse.json({
      deliveries: rows.map((row) => ({
        ...row,
        url: publicDeliveryPath(row.title, row.public_token),
      })),
    });
  } catch (error) {
    console.error("[client/recent-deliveries] load failed", error);
    return NextResponse.json({ error: "Recent deliveries are temporarily unavailable." }, { status: 500 });
  }
}
