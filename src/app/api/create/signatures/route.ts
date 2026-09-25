import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import {
  createPrivateAssetPrefix,
  getLetterhead,
  getLetterheadAssetReplacement,
  isCreatePrivateAssetPath,
  LETTERHEAD_BUCKET,
  updateLetterheadAsset,
} from "@/lib/create-platform/letterheads";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import {
  CLIENT_STORAGE_FULL_CODE,
  isClientStorageFullError,
  releaseClientStorageReservation,
  reserveClientStorage,
} from "@/lib/client-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SavedSignatureRow = {
  id: string;
  name: string;
  storage_path: string;
  storage_name: string | null;
  size_bytes: string;
  updated_at: string;
};

function publicSignature(actorKind: string, row: SavedSignatureRow) {
  const version = row.storage_path.split("/").pop() || row.updated_at;
  return {
    id: row.id,
    name: row.name,
    assetUrl: `/api/create/signatures/${encodeURIComponent(row.id)}/asset?workspace=${encodeURIComponent(actorKind)}&v=${encodeURIComponent(version)}`,
    updatedAt: row.updated_at,
  };
}

async function listSavedSignatures(actor: { kind: string; id: string }) {
  const rows = await glashQuery<SavedSignatureRow>(
    `select id::text, name, storage_path, storage_name, size_bytes::text, updated_at::text
       from public.create_saved_signatures
      where owner_kind = $1 and owner_id = $2 and deleted_at is null
      order by updated_at desc, name`,
    [actor.kind, actor.id],
  );
  return rows.map((row) => publicSignature(actor.kind, row));
}

export async function GET(req: NextRequest) {
  const actor = await getCreateActorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  if (actor.accessLocked) return NextResponse.json({ error: "Create is not available on this account yet." }, { status: 403 });
  return NextResponse.json({ signatures: await listSavedSignatures(actor) });
}

export async function POST(req: NextRequest) {
  const actor = await getCreateActorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  if (actor.accessLocked) return NextResponse.json({ error: "Create is not available on this account yet." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const letterheadId = String(body.letterheadId || "");
  if (!UUID.test(letterheadId)) return NextResponse.json({ error: "Invalid letterhead ID." }, { status: 400 });
  const letterhead = await getLetterhead(actor, letterheadId);
  if (!letterhead) return NextResponse.json({ error: "Letterhead not found." }, { status: 404 });

  if (action === "save") {
    const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) return NextResponse.json({ error: "Enter a name for this signature." }, { status: 400 });
    const duplicate = await glashMaybeOne<{ id: string }>(
      `select id::text from public.create_saved_signatures
        where owner_kind = $1 and owner_id = $2 and lower(name) = lower($3) and deleted_at is null`,
      [actor.kind, actor.id, name],
    );
    if (duplicate) return NextResponse.json({ error: "A saved signature already uses this name." }, { status: 409 });

    const sourceKind = body.sourceKind === "additional" ? "additional" : "primary";
    let sourcePath: string | null = letterhead.signaturePath;
    let sourceName: string | null = letterhead.signatureName;
    let sourceBytes = 0;
    if (sourceKind === "additional") {
      const sourceId = String(body.sourceId || "");
      if (!UUID.test(sourceId)) return NextResponse.json({ error: "Choose a valid signature." }, { status: 400 });
      const source = await glashMaybeOne<{ storage_path: string | null; storage_name: string | null; size_bytes: string }>(
        `select signature.storage_path, signature.storage_name, signature.size_bytes::text
           from public.create_letterhead_signatures signature
           join public.create_letterheads letterhead on letterhead.id = signature.letterhead_id
          where signature.id = $3::uuid and signature.letterhead_id = $4::uuid
            and signature.status in ('ready', 'signed')
            and letterhead.owner_kind = $1 and letterhead.owner_id = $2 and letterhead.deleted_at is null`,
        [actor.kind, actor.id, sourceId, letterheadId],
      );
      sourcePath = source?.storage_path || null;
      sourceName = source?.storage_name || null;
      sourceBytes = Number(source?.size_bytes || 0);
    } else {
      sourceBytes = Number((await getLetterheadAssetReplacement(actor, letterheadId, "signature")).bytes || 0);
    }
    if (!sourcePath || !isCreatePrivateAssetPath(actor, sourcePath)) {
      return NextResponse.json({ error: "This signature is not available to save." }, { status: 400 });
    }

    let reservationId: string | null = null;
    let uploadedPath: string | null = null;
    try {
      const db = getGlashDbAdmin() as any;
      const downloaded = await db.storage.from(LETTERHEAD_BUCKET).download(sourcePath);
      if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message || "The signature file could not be read.");
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      if (actor.kind === "client") reservationId = await reserveClientStorage(actor.id, bytes.byteLength || sourceBytes, 0);
      const signatureId = crypto.randomUUID();
      uploadedPath = `${createPrivateAssetPrefix(actor)}/signature-library/${signatureId}-${crypto.randomUUID()}.png`;
      const uploaded = await db.storage.from(LETTERHEAD_BUCKET).upload(uploadedPath, bytes, { contentType: "image/png", upsert: false });
      if (uploaded.error) throw new Error(uploaded.error.message);
      await glashQuery(
        `insert into public.create_saved_signatures
           (id, owner_kind, owner_id, name, storage_path, storage_name, size_bytes)
         values ($1::uuid, $2, $3, $4, $5, $6, $7)`,
        [signatureId, actor.kind, actor.id, name, uploadedPath, sourceName || `${name}.png`, bytes.byteLength],
      );
      return NextResponse.json({ ok: true, signatures: await listSavedSignatures(actor) }, { status: 201 });
    } catch (error) {
      if (uploadedPath) {
        const db = getGlashDbAdmin() as any;
        await db.storage.from(LETTERHEAD_BUCKET).remove([uploadedPath]).catch(() => undefined);
      }
      const storageFull = isClientStorageFullError(error);
      return NextResponse.json({ error: error instanceof Error ? error.message : "The signature could not be saved.", ...(storageFull ? { code: CLIENT_STORAGE_FULL_CODE } : {}) }, { status: storageFull ? 409 : 500 });
    } finally {
      await releaseClientStorageReservation(reservationId).catch(() => undefined);
    }
  }

  if (action === "apply") {
    const savedSignatureId = String(body.signatureId || "");
    if (!UUID.test(savedSignatureId)) return NextResponse.json({ error: "Choose a valid saved signature." }, { status: 400 });
    const saved = await glashMaybeOne<SavedSignatureRow>(
      `select id::text, name, storage_path, storage_name, size_bytes::text, updated_at::text
         from public.create_saved_signatures
        where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null`,
      [actor.kind, actor.id, savedSignatureId],
    );
    if (!saved || !isCreatePrivateAssetPath(actor, saved.storage_path)) return NextResponse.json({ error: "Saved signature not found." }, { status: 404 });

    let reservationId: string | null = null;
    let uploadedPath: string | null = null;
    try {
      const db = getGlashDbAdmin() as any;
      const downloaded = await db.storage.from(LETTERHEAD_BUCKET).download(saved.storage_path);
      if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message || "The saved signature could not be read.");
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      const previous = await getLetterheadAssetReplacement(actor, letterheadId, "signature");
      if (actor.kind === "client") reservationId = await reserveClientStorage(actor.id, bytes.byteLength, previous.referenceCount <= 1 ? previous.bytes : 0);
      uploadedPath = `${createPrivateAssetPrefix(actor)}/${letterheadId}/signature-${crypto.randomUUID()}.png`;
      const uploaded = await db.storage.from(LETTERHEAD_BUCKET).upload(uploadedPath, bytes, { contentType: "image/png", upsert: false });
      if (uploaded.error) throw new Error(uploaded.error.message);
      const updated = await updateLetterheadAsset(actor, letterheadId, "signature", uploadedPath, saved.storage_name || `${saved.name}.png`, bytes.byteLength);
      if (previous.path && previous.referenceCount <= 1 && isCreatePrivateAssetPath(actor, previous.path)) {
        await db.storage.from(LETTERHEAD_BUCKET).remove([previous.path]).catch(() => undefined);
      }
      return NextResponse.json({ ok: true, letterhead: updated });
    } catch (error) {
      if (uploadedPath) {
        const db = getGlashDbAdmin() as any;
        await db.storage.from(LETTERHEAD_BUCKET).remove([uploadedPath]).catch(() => undefined);
      }
      const storageFull = isClientStorageFullError(error);
      return NextResponse.json({ error: error instanceof Error ? error.message : "The saved signature could not be used.", ...(storageFull ? { code: CLIENT_STORAGE_FULL_CODE } : {}) }, { status: storageFull ? 409 : 500 });
    } finally {
      await releaseClientStorageReservation(reservationId).catch(() => undefined);
    }
  }

  return NextResponse.json({ error: "Unsupported signature action." }, { status: 400 });
}
