import "server-only";
import { BRAND_IDENTITY_BUCKET, type BrandIdentityDelivery } from "@/lib/brand-identity";

export async function attachBrandIdentityFiles(
  db: any,
  delivery: Record<string, any>,
  expiresIn = 60 * 60,
): Promise<BrandIdentityDelivery> {
  const { data: rows, error } = await db
    .from("brand_identity_delivery_files")
    .select("*")
    .eq("delivery_id", delivery.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const files = await Promise.all((rows || []).map(async (file: Record<string, any>) => {
    const { data } = await db.storage
      .from(BRAND_IDENTITY_BUCKET)
      .createSignedUrl(file.storage_path, expiresIn);
    return {
      id: file.id,
      delivery_id: file.delivery_id,
      file_name: file.file_name,
      mime_type: file.mime_type || null,
      file_size: Number(file.file_size || 0),
      file_kind: file.file_kind || "document",
      position: Number(file.position || 0),
      created_at: file.created_at,
      download_url: data?.signedUrl || null,
    };
  }));

  return {
    id: delivery.id,
    user_id: delivery.user_id,
    project_id: delivery.project_id,
    brief_id: delivery.brief_id || null,
    title: delivery.title,
    description: delivery.description || null,
    public_token: delivery.public_token,
    is_public: Boolean(delivery.is_public),
    published_at: delivery.published_at || null,
    created_at: delivery.created_at,
    updated_at: delivery.updated_at,
    project_name: delivery.project_name || delivery.finance_projects?.name || null,
    client_name: delivery.client_name || delivery.finance_projects?.client || null,
    files,
  };
}
