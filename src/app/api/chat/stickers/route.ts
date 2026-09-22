/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import {
  isStickerVideo,
  MAX_STICKER_IMAGE_BYTES,
  videoToGifSticker,
} from "@/lib/chat-sticker-processing";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getChatViewer } from "@/lib/team-chat-auth";
import { getViewerReactionKey } from "@/lib/team-chat-server";
import { assertSafeImage } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveOwner(actor: unknown) {
  if (actor === "client") {
    const session = await verifyUser();
    return session ? `client:${session.user.id}` : null;
  }
  const viewer = await getChatViewer();
  if (viewer) return getViewerReactionKey(viewer);
  const session = await verifyUser();
  return session ? `client:${session.user.id}` : null;
}

export async function GET(req: Request) {
  const actor = new URL(req.url).searchParams.get("actor");
  const ownerKey = await resolveOwner(actor);
  const db = getGlashDbAdmin() as any;
  if (!ownerKey || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const columns = "id, title, asset_url, emoji, background, mime_type, created_at";
  const sharedQuery = db
    .from("team_chat_stickers")
    .select(columns)
    .eq("is_active", true)
    .not("owner_key", "like", "client:%")
    .order("created_at", { ascending: false })
    .limit(120);

  if (!ownerKey.startsWith("client:")) {
    const { data, error } = await sharedQuery;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, stickers: data || [] });
  }

  const [{ data: shared, error: sharedError }, { data: personal, error: personalError }] = await Promise.all([
    sharedQuery,
    db.from("team_chat_stickers").select(columns).eq("is_active", true).eq("owner_key", ownerKey).order("created_at", { ascending: false }).limit(60),
  ]);
  const error = sharedError || personalError;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const stickers = [...(personal || []), ...(shared || [])]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 120);
  return NextResponse.json({ ok: true, stickers });
}

export async function POST(req: Request) {
  const db = getGlashDbAdmin() as any;
  if (!db) return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });

  try {
    const contentType = req.headers.get("content-type") || "";
    let actor: unknown;
    let title = "Custom sticker";
    let assetUrl: string | null = null;
    let emoji: string | null = null;
    let mimeType: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      actor = formData.get("actor");
      const ownerKey = await resolveOwner(actor);
      if (!ownerKey) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ ok: false, error: "Choose a sticker image or short video." }, { status: 400 });
      }
      title = String(formData.get("title") || file.name || title).trim().slice(0, 40);
      const safe = isStickerVideo(file)
        ? await videoToGifSticker(file)
        : await assertSafeImage(file, {
            maxBytes: MAX_STICKER_IMAGE_BYTES,
            maxDimension: 512,
          });
      const objectPath = `chat-stickers/${randomUUID()}.${safe.ext}`;
      const { error: uploadError } = await db.storage.from("media").upload(objectPath, safe.buffer, {
        contentType: safe.contentType,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data: publicAsset } = db.storage.from("media").getPublicUrl(objectPath);
      assetUrl = publicAsset.publicUrl;
      mimeType = safe.contentType;

      const { data, error } = await db
        .from("team_chat_stickers")
        .insert({ owner_key: ownerKey, title: title || "Custom sticker", asset_url: assetUrl, emoji: null, background: "transparent", mime_type: mimeType })
        .select("id, title, asset_url, emoji, background, mime_type, created_at")
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, sticker: data });
    }

    const body = await req.json().catch(() => ({}));
    actor = body.actor;
    const ownerKey = await resolveOwner(actor);
    if (!ownerKey) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    emoji = String(body.emoji || "").trim().slice(0, 24);
    title = String(body.title || "Custom sticker").trim().slice(0, 40);
    if (!emoji) {
      return NextResponse.json({ ok: false, error: "Add an emoji for the sticker." }, { status: 400 });
    }

    const { data, error } = await db
      .from("team_chat_stickers")
      .insert({ owner_key: ownerKey, title: title || "Custom sticker", asset_url: null, emoji, background: "transparent", mime_type: null })
      .select("id, title, asset_url, emoji, background, mime_type, created_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, sticker: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sticker could not be saved.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
