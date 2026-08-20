import { NextResponse } from "next/server";
import { brandIdentityPublicPath } from "@/lib/brand-identity";
import { readClientDashboardSessionUser } from "@/lib/client-dashboard-session";
import { publicDeliveryPath } from "@/lib/delivery-links";
import { glashQuery } from "@/lib/glashdb/postgres";
import { absolutePublicUrl } from "@/lib/public-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdentityRow = {
  id: string;
  user_id: string;
  project_id: string;
  brief_id: string | null;
  title: string;
  description: string | null;
  public_token: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  project_name: string | null;
  client_name: string | null;
  folder_public_token: string | null;
  folder_delivery_title: string | null;
};

type IdentityFileRow = {
  id: string;
  delivery_id: string;
  file_name: string;
  mime_type: string | null;
  file_size: string;
  file_kind: string;
  position: number;
  created_at: string;
};

function isUnappliedBrandIdentitySchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /brand_identity_deliver|relation .* does not exist|schema cache/i.test(message);
}

export async function GET() {
  const user = await readClientDashboardSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Load the delivery cards and folder-view links in one database round trip.
    // Per-file signed URL generation used to make this endpoint wait on dozens
    // of serial storage operations before the client could see any files.
    const identities = await glashQuery<IdentityRow>(
      `select i.id, i.user_id, i.project_id, i.brief_id, i.title, i.description,
              i.public_token::text, i.published_at, i.created_at, i.updated_at,
              fp.name as project_name, fp.client as client_name,
              folder.public_token::text as folder_public_token,
              folder.title as folder_delivery_title
         from public.brand_identity_deliveries i
         join public.profiles p on p.id = i.user_id
         left join public.finance_projects fp on fp.id = i.project_id
         left join lateral (
           select d.public_token, d.title
             from public.client_deliveries d
            where d.brand_identity_delivery_id = i.id
              and d.client_user_id = i.user_id
              and d.status = 'published'
              and d.public_access_revoked_at is null
            order by d.published_at desc nulls last, d.created_at desc
            limit 1
         ) folder on true
        where i.user_id = $1::uuid
          and i.is_public = true
          and i.published_at is not null
          and coalesce(p.account_status, 'active') = 'active'
          and exists (
            select 1 from public.user_legal_agreements a where a.user_id = i.user_id
          )
        order by i.published_at desc`,
      [user.id],
    );

    const identityIds = identities.map((identity) => identity.id);
    const files = identityIds.length
      ? await glashQuery<IdentityFileRow>(
          `select id, delivery_id, file_name, mime_type, file_size::bigint::text,
                  file_kind, position, created_at
             from public.brand_identity_delivery_files
            where delivery_id = any($1::uuid[])
            order by delivery_id, position, created_at`,
          [identityIds],
        )
      : [];

    const filesByDelivery = new Map<string, IdentityFileRow[]>();
    for (const file of files) {
      const current = filesByDelivery.get(file.delivery_id) || [];
      current.push(file);
      filesByDelivery.set(file.delivery_id, current);
    }

    return NextResponse.json({
      identities: identities.map((identity) => ({
        id: identity.id,
        user_id: identity.user_id,
        project_id: identity.project_id,
        brief_id: identity.brief_id,
        title: identity.title,
        description: identity.description,
        public_token: identity.public_token,
        is_public: true,
        published_at: identity.published_at,
        created_at: identity.created_at,
        updated_at: identity.updated_at,
        project_name: identity.project_name,
        client_name: identity.client_name,
        public_url: identity.folder_public_token
          ? absolutePublicUrl(publicDeliveryPath(identity.folder_delivery_title || identity.title, identity.folder_public_token))
          : absolutePublicUrl(brandIdentityPublicPath(identity.public_token)),
        files: (filesByDelivery.get(identity.id) || []).map((file) => ({
          id: file.id,
          delivery_id: file.delivery_id,
          file_name: file.file_name,
          mime_type: file.mime_type,
          file_size: Number(file.file_size || 0),
          file_kind: file.file_kind || "document",
          position: Number(file.position || 0),
          created_at: file.created_at,
          download_url: `/api/client/brand-identities/files/${encodeURIComponent(file.id)}`,
        })),
      })),
    });
  } catch (error) {
    console.error("[client/brand-identities] delivery lookup failed", error);
    return NextResponse.json({
      identities: [],
      setup_required: isUnappliedBrandIdentitySchema(error),
      temporarily_unavailable: !isUnappliedBrandIdentitySchema(error),
    });
  }
}
