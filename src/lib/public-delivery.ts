import "server-only";
import { cache } from "react";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { deliveryTokenFromReference } from "@/lib/delivery-links";

export type PublicDeliveryFile = {
  id: string;
  file_name: string;
  relative_path: string;
  mime_type: string | null;
  file_size: number;
  file_kind: "image" | "pdf" | "office" | "archive" | "document";
  preview_version: string;
};

export type PublicDeliverySummary = {
  id: string;
  token: string;
  delivery_type: "brand_identity" | "design";
  title: string;
  description: string | null;
  client_name: string | null;
  project_name: string | null;
  external_url: string | null;
  cover_version: string | null;
  published_at: string | null;
  created_at: string;
};

export type PublicDelivery = Omit<PublicDeliverySummary, "id"> & {
  files: PublicDeliveryFile[];
};

export const getPublicDeliverySummary = cache(async (reference: string): Promise<PublicDeliverySummary | null> => {
  const token = deliveryTokenFromReference(reference);
  if (!token) return null;

  const delivery = await glashMaybeOne<{
    id: string;
    public_token: string;
    delivery_type: "brand_identity" | "design";
    title: string;
    description: string | null;
    client_name: string | null;
    project_name: string | null;
    external_url: string | null;
    cover_version: string | null;
    published_at: string | null;
    created_at: string;
  }>(
    `select d.id, d.public_token::text, d.delivery_type, d.title, d.description,
            coalesce(p.company_name, p.full_name, p.email, c.brand_name, c.name) as client_name,
            fp.name as project_name, d.external_url,
            case when d.cover_storage_path is not null
              then (extract(epoch from d.cover_updated_at) * 1000)::bigint::text
              else null
            end as cover_version,
            d.published_at, d.created_at
       from public.client_deliveries d
       left join public.profiles p on p.id = d.client_user_id
       left join public.clients c on c.id = d.manual_client_id
       left join public.finance_projects fp on fp.id = d.project_id
      where d.public_token = $1::uuid
        and d.status in ('awaiting_account', 'published')
        and d.public_access_revoked_at is null
      limit 1`,
    [token],
  );
  if (!delivery) return null;

  return {
    id: delivery.id,
    token: delivery.public_token,
    delivery_type: delivery.delivery_type,
    title: delivery.title,
    description: delivery.description,
    client_name: delivery.client_name,
    project_name: delivery.project_name,
    external_url: delivery.external_url,
    cover_version: delivery.cover_version,
    published_at: delivery.published_at,
    created_at: delivery.created_at,
  };
});

export const getPublicDeliveryFiles = cache(async (deliveryId: string): Promise<PublicDeliveryFile[]> => {
  const files = await glashQuery<PublicDeliveryFile>(
    `select id, file_name, coalesce(nullif(relative_path, ''), file_name) as relative_path,
            mime_type, file_size::bigint::text, file_kind,
            substr(md5(storage_path), 1, 16) as preview_version
       from public.client_delivery_files
      where delivery_id = $1
      order by position, created_at`,
    [deliveryId],
  );

  return files.map((file) => ({ ...file, file_size: Number(file.file_size || 0) }));
});

export const getPublicDelivery = cache(async (reference: string): Promise<PublicDelivery | null> => {
  const delivery = await getPublicDeliverySummary(reference);
  if (!delivery) return null;
  const files = await getPublicDeliveryFiles(delivery.id);

  return {
    token: delivery.token,
    delivery_type: delivery.delivery_type,
    title: delivery.title,
    description: delivery.description,
    client_name: delivery.client_name,
    project_name: delivery.project_name,
    external_url: delivery.external_url,
    cover_version: delivery.cover_version,
    published_at: delivery.published_at,
    created_at: delivery.created_at,
    files,
  };
});
