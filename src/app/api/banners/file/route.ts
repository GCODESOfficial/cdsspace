import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export async function GET(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const path = new URL(request.url).searchParams.get("path") || "";
  if (!path.startsWith(`${session.user.id}/`) || path.includes("..") || path.includes("\\")) {
    return NextResponse.json({ error: "Invalid artwork path" }, { status: 400 });
  }

  const { data, error } = await (supabaseAdmin as any).storage.from("banners").download(path);
  if (error || !data) return NextResponse.json({ error: "Artwork not found" }, { status: 404 });

  const extension = path.split(".").pop()?.toLowerCase() || "";
  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": contentTypes[extension] || data.type || "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300, stale-while-revalidate=900",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
