import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";
import { supabase } from "@/lib/supabase";
import { slugifyTitle } from "@/lib/work-slug";
import { isPdfUrl } from "@/lib/work-asset";

export const runtime = "nodejs";
export const alt = "CDS Space - Our Work";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = Promise<{ slug: string }>;

interface WorkRow {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  cover_image: string | null;
}

// The `works` table has no slug column, so match the slugified title in-memory
// (same approach as the page). Returns the work plus its hero image (the
// uploaded cover, falling back to the first gallery image).
async function resolveWork(slug: string): Promise<{ work: WorkRow; hero: string | null } | null> {
  const target = slug.toLowerCase();
  const { data } = await supabase
    .from("works")
    .select("id, title, description, category, cover_image");
  const work = ((data as WorkRow[] | null) ?? []).find((w) => slugifyTitle(w.title) === target);
  if (!work) return null;

  // The share image must be a real image - never a PDF asset.
  let hero = work.cover_image && !isPdfUrl(work.cover_image) ? work.cover_image : null;
  if (!hero) {
    const { data: imgs } = await supabase
      .from("work_images")
      .select("image_url, position")
      .eq("work_id", work.id)
      .order("position", { ascending: true, nullsFirst: false });
    hero = ((imgs as { image_url: string }[] | null) ?? []).find((i) => !isPdfUrl(i.image_url))?.image_url ?? null;
  }
  return { work, hero };
}

export default async function Image({ params }: { params: Params }) {
  const { slug } = await params;

  let resolved = null;
  try { resolved = await resolveWork(slug); } catch { /* fall through to brand card */ }

  // When a cover image exists, use it directly as the share/link-preview image.
  if (resolved?.hero) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolved.hero} alt="" width={OG_SIZE.width} height={OG_SIZE.height} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ),
      { ...size },
    );
  }

  // No cover uploaded - fall back to a branded card so the preview still reads well.
  const fonts = getOgFonts();
  return new ImageResponse(
    await renderBrandCard({
      eyebrow: resolved?.work.category || "Our Work",
      title: resolved?.work.title || "CDS Space - Our Work",
      description: resolved?.work.description?.slice(0, 140) || "Brand identity, packaging, and visual branding by CDS Space.",
      domainPath: "/work",
    }),
    { ...size, fonts },
  );
}
