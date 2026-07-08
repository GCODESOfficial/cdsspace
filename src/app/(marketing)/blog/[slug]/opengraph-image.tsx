import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";
import { getPublishedPost } from "@/lib/blog/queries";

export const runtime = "nodejs";
export const alt = "CDS Space Blog";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = Promise<{ slug: string }>;

export default async function Image({ params }: { params: Params }) {
  const { slug } = await params;
  const fonts = getOgFonts();

  let post = null;
  try { post = await getPublishedPost(slug); } catch { /* fall through */ }

  // When a cover banner exists, use it directly as the share image.
  if (post?.cover_url) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.cover_url} alt="" width={OG_SIZE.width} height={OG_SIZE.height} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ),
      { ...size },
    );
  }

  return new ImageResponse(
    await renderBrandCard({
      eyebrow: post?.category || "Blog",
      title: post?.title || "CDS Space Blog",
      description: post?.excerpt || "Insights, research, and growth from CDS Space.",
      domainPath: "/blog",
    }),
    { ...size, fonts },
  );
}
