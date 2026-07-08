import { NextResponse } from "next/server";
import { listPublishedPosts } from "@/lib/blog/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const posts = await listPublishedPosts();
    return NextResponse.json({ ok: true, posts });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to load posts", posts: [] }, { status: 200 });
  }
}
