import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREVIEW_MIME_TYPES: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid banner order" }, { status: 400 });
  }

  const { data: banner, error: bannerError } = await supabaseAdmin!
    .from("banner_requests")
    .select("ready_file_url, ready_file_urls")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (bannerError || !banner) {
    return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
  }

  const paths = Array.isArray(banner.ready_file_urls)
    ? banner.ready_file_urls
    : banner.ready_file_url
      ? [banner.ready_file_url]
      : [];
  const storagePath = typeof paths[0] === "string" ? paths[0] : "";
  const extension = storagePath.split(".").pop()?.toLowerCase() || "";

  if (
    !storagePath.startsWith(`${session.user.id}/`)
    || storagePath.includes("..")
    || !PREVIEW_MIME_TYPES[extension]
  ) {
    return NextResponse.json({ error: "No previewable artwork is attached" }, { status: 404 });
  }

  const { data: artwork, error: downloadError } = await (supabaseAdmin as any).storage
    .from("banners")
    .download(storagePath);

  if (downloadError || !artwork) {
    return NextResponse.json({ error: "Artwork could not be loaded" }, { status: 404 });
  }

  return new NextResponse(await artwork.arrayBuffer(), {
    headers: {
      "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      "Content-Disposition": "inline",
      "Content-Type": artwork.type || PREVIEW_MIME_TYPES[extension],
      "X-Content-Type-Options": "nosniff",
    },
  });
}
