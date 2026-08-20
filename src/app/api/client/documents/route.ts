import { NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { glashQuery } from "@/lib/glashdb/postgres";
import { absolutePublicUrl } from "@/lib/public-site";
import { publicDeliveryPath } from "@/lib/delivery-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [projectDocuments, deliveries] = await Promise.all([
      glashQuery<{
        id: string;
        title: string;
        description: string | null;
        kind: "cdoc" | "protected" | "link";
        file_url: string | null;
        created_at: string;
      }>(
        `select id, title, description, kind, file_url, created_at
           from public.project_documents
          where client_user_id = $1
            and visibility <> 'internal'
          order by created_at desc`,
        [account.user.id],
      ),
      glashQuery<{
        id: string;
        title: string;
        description: string | null;
        delivery_type: "brand_identity" | "design";
        external_url: string | null;
        published_at: string;
        public_token: string;
      }>(
        `select d.id, d.title, d.description, d.delivery_type, d.external_url, d.published_at,
                d.public_token::text
           from public.client_deliveries d
          where d.client_user_id = $1
            and d.status = 'published'
            and d.published_at is not null
            and d.public_access_revoked_at is null
          order by d.published_at desc`,
        [account.user.id],
      ),
    ]);

    const grouped = new Map<string, {
      id: string;
      title: string;
      description: string | null;
      kind: "delivery";
      created_at: string;
      resources: Array<{ id: string; label: string; url: string; source: "upload" | "google" }>;
    }>();
    for (const row of deliveries) {
      let item = grouped.get(row.id);
      if (!item) {
        item = {
          id: row.id,
          title: row.title,
          description: row.description,
          kind: "delivery",
          created_at: row.published_at,
          resources: [{ id: `${row.id}-delivery`, label: "Open delivery folder", url: absolutePublicUrl(publicDeliveryPath(row.title, row.public_token)), source: "upload" }],
        };
        if (row.external_url) {
          item.resources.push({ id: `${row.id}-google`, label: "Open Google file or folder", url: row.external_url, source: "google" });
        }
        grouped.set(row.id, item);
      }
    }

    const standardDocuments = projectDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      description: document.description,
      kind: document.kind,
      created_at: document.created_at,
      resources: document.file_url
        ? [{ id: `${document.id}-resource`, label: "Open document", url: document.file_url, source: "upload" as const }]
        : [],
    }));
    const documents = [...standardDocuments, ...grouped.values()]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[client/documents] load failed", error);
    return NextResponse.json({ error: "Documents are temporarily unavailable." }, { status: 500 });
  }
}
