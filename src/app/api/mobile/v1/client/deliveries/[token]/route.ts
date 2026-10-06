import { verifyUser } from "@/lib/admin-auth";
import { getPublicDelivery } from "@/lib/public-delivery";
import { mobileJson } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

// One delivery for the app's native delivery screen: the same files the public
// delivery page shows (src/app/delivery/[token]/page.tsx), as data. Files are
// served by /api/delivery/<token>/files/<id> (?preview=1 thumbnails for images,
// ?download=1 to save) and the whole delivery by /api/delivery/<token>/download.
export async function GET(_request: Request, { params }: { params: Params }) {
  const session = await verifyUser();
  if (!session) return mobileJson({ error: "Unauthorized" }, 401);
  const { token } = await params;
  const delivery = await getPublicDelivery(token).catch(() => null);
  if (!delivery) return mobileJson({ error: "This delivery is not available." }, 404);

  const base = `/api/delivery/${encodeURIComponent(delivery.token)}`;
  return mobileJson({
    delivery: {
      token: delivery.token,
      title: delivery.title,
      description: delivery.description,
      type: delivery.delivery_type,
      projectName: delivery.project_name,
      externalUrl: delivery.external_url,
      publishedAt: delivery.published_at || delivery.created_at,
      coverUrl: delivery.cover_version ? `${base}/cover?v=${delivery.cover_version}` : null,
      downloadAllUrl: `${base}/download`,
      files: delivery.files.map((file) => ({
        id: file.id,
        name: file.file_name,
        path: file.relative_path,
        mimeType: file.mime_type,
        size: file.file_size,
        kind: file.file_kind,
        url: `${base}/files/${file.id}`,
        previewUrl: file.file_kind === "image" ? `${base}/files/${file.id}?preview=1&v=${file.preview_version}` : null,
      })),
    },
  });
}
