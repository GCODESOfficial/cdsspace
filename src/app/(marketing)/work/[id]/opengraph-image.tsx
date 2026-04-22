import { ImageResponse } from "next/og";
import { renderWorkCard, renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const alt = "CDS Space — Project";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = { id: string };

export default async function Image({ params }: { params: Params }) {
  const numericId = Number(params.id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return new ImageResponse(
      renderBrandCard({
        eyebrow: "Project",
        title: "CDS Space",
        description: "A design project by CDS Space.",
        domainPath: `/work`,
      }),
      { ...size },
    );
  }

  const [{ data: w }, { data: imgs }] = await Promise.all([
    supabase
      .from("works")
      .select("id, title, description, category, cover_image, industry, project_scope")
      .eq("id", numericId)
      .maybeSingle(),
    supabase
      .from("work_images")
      .select("image_url, position")
      .eq("work_id", numericId)
      .order("position", { ascending: true, nullsFirst: false })
      .limit(1),
  ]);

  const work = w as
    | {
        id: number;
        title: string;
        description: string | null;
        category: string | null;
        cover_image: string | null;
        industry: string | null;
        project_scope: string | null;
      }
    | null;

  if (!work) {
    return new ImageResponse(
      renderBrandCard({
        eyebrow: "Project not found",
        title: "CDS Space",
        description: "This project link is no longer available.",
        domainPath: "/work",
      }),
      { ...size },
    );
  }

  const cover = work.cover_image || imgs?.[0]?.image_url || undefined;
  const desc = work.description?.slice(0, 160) ?? `A ${work.category ?? "design"} project by CDS Space.`;
  const tags = [
    work.industry,
    ...(work.project_scope?.split(/\r?\n|,/).map((s) => s.trim()) || []),
  ]
    .filter(Boolean)
    .slice(0, 4) as string[];

  return new ImageResponse(
    renderWorkCard({
      title: work.title,
      description: desc,
      tags,
      category: work.category,
      coverImageUrl: cover,
      workId: work.id,
    }),
    { ...size },
  );
}
