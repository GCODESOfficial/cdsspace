import { NextRequest, NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BUCKET = "client-brand-assets";
const MAX_FILES_PER_UPLOAD = 6;

async function requireClientAccount() {
  const account = await getClientAccountState();
  if (!account?.agreement) return null;
  return account;
}

function cleanFileName(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, "-").replace(/-+/g, "-").slice(-140) || "brand-asset";
}

async function withSignedUrls(rows: any[]) {
  const db = getGlashDbAdmin() as any;
  return Promise.all(rows.map(async (asset) => {
    const { data } = await db.storage.from(BUCKET).createSignedUrl(asset.storage_path, 60 * 60);
    return { ...asset, download_url: data?.signedUrl || null };
  }));
}

export async function GET() {
  const account = await requireClientAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = getGlashDbAdmin() as any;
    const { data, error } = await db
      .from("client_brand_assets")
      .select("*")
      .eq("user_id", account.user.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ assets: await withSignedUrls(data || []) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load brand assets." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const account = await requireClientAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const files = form?.getAll("files").filter((entry): entry is File => entry instanceof File) || [];
  if (!files.length) return NextResponse.json({ error: "Choose at least one file to upload." }, { status: 400 });
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return NextResponse.json({ error: `Upload up to ${MAX_FILES_PER_UPLOAD} files at a time.` }, { status: 400 });
  }

  const db = getGlashDbAdmin() as any;
  try {
    const { data: brief } = await db
      .from("brand_briefs")
      .select("id")
      .eq("client_user_id", account.user.id)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const uploaded: any[] = [];
    for (const file of files) {
      const safe = await assertSafeUpload(file, {
        allow: ["image", "pdf", "office", "zip"],
        maxBytes: 25 * 1024 * 1024,
      });
      const safeName = cleanFileName(file.name);
      const storagePath = `${account.user.id}/${crypto.randomUUID()}-${safeName}.${safe.ext}`;
      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(storagePath, safe.buffer, {
          contentType: safe.contentType,
          upsert: false,
        });
      if (uploadError) throw new Error(uploadError.message);

      const fileKind = safe.kind === "zip" ? "archive" : safe.kind;
      const { data: asset, error: assetError } = await db
        .from("client_brand_assets")
        .insert({
          user_id: account.user.id,
          brief_id: brief?.id || null,
          file_name: file.name.slice(0, 180),
          storage_path: storagePath,
          mime_type: safe.contentType,
          file_size: safe.buffer.length,
          file_kind: fileKind,
        })
        .select("*")
        .single();
      if (assetError || !asset) {
        await db.storage.from(BUCKET).remove([storagePath]);
        throw new Error(assetError?.message || "Could not record the uploaded asset.");
      }
      uploaded.push(asset);
    }

    return NextResponse.json({ assets: await withSignedUrls(uploaded) });
  } catch (error) {
    const status = error instanceof UploadSecurityError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Brand asset upload failed." },
      { status },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const account = await requireClientAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Asset ID is required." }, { status: 400 });

  try {
    const db = getGlashDbAdmin() as any;
    const { data: asset, error } = await db
      .from("client_brand_assets")
      .select("id, storage_path")
      .eq("id", id)
      .eq("user_id", account.user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

    await db.storage.from(BUCKET).remove([asset.storage_path]);
    const { error: deleteError } = await db
      .from("client_brand_assets")
      .delete()
      .eq("id", asset.id)
      .eq("user_id", account.user.id);
    if (deleteError) throw new Error(deleteError.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove the brand asset." },
      { status: 500 },
    );
  }
}
