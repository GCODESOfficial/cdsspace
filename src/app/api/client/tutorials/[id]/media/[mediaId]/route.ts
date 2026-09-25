import { NextRequest, NextResponse } from "next/server";
import { getCreateActor } from "@/lib/create-platform/session";
import { getTutorialAsset } from "@/lib/tutorials";
import { tutorialMediaResponse } from "@/lib/tutorial-media-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const actor = await getCreateActor("client");
  if (!actor) return NextResponse.json({ error: "Sign in to view tutorials." }, { status: 401 });
  const { id, mediaId } = await params;
  const requestedKind = new URL(request.url).searchParams.get("kind");
  const kind = requestedKind === "captions" || requestedKind === "audio" ? requestedKind : "video";
  const asset = await getTutorialAsset({ tutorialId: id, mediaId, kind });
  if (!asset?.path) return NextResponse.json({ error: "Tutorial media was not found." }, { status: 404 });
  return tutorialMediaResponse(request, asset);
}
