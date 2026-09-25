import "server-only";

import { after } from "next/server";
import { glashMaybeOne, glashPool, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import { BRAND_IDENTITY_BUCKET } from "@/lib/brand-identity";
import {
  CLIENT_DELIVERABLES_BUCKET,
  MAX_DELIVERY_BATCH_BYTES,
  MAX_DELIVERY_FILES,
  isGoogleDeliverableUrl,
  deliveryFileMaximumBytes,
  type ClientDeliveryType,
} from "@/lib/client-deliveries";
import { deliverClientDeliveryEmail } from "@/lib/client-delivery-email";
import {
  deliveryPreviewPath,
  deliveryPreviewVersion,
  getOrCreateDeliveryImagePreview,
} from "@/lib/delivery-previews";
import { scrubClientDeliveryCoverObject } from "@/lib/delivery-covers";

export interface ClientDeliveryRow {
  id: string;
  delivery_type: ClientDeliveryType;
  title: string;
  description: string | null;
  status: string;
  project_id: string | null;
  client_user_id: string | null;
  manual_client_id: string | null;
  assigned_team_lead_id: string | null;
  submitted_by_team_member_id: string | null;
  submitted_by_admin: string | null;
  external_url: string | null;
  cover_storage_bucket: string | null;
  cover_storage_path: string | null;
  cover_mime_type: string | null;
  cover_updated_at: string | null;
  brand_identity_delivery_id: string | null;
  created_by: string;
}

export class DeliveryWorkflowError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DeliveryWorkflowError";
    this.status = status;
  }
}

export function cleanDeliveryText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function safeFileBase(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-120) || "deliverable";
}

function safePathSegment(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f<>:"|?*]/g, "-")
    .replace(/\.+$/g, "")
    .trim()
    .slice(0, 120) || "folder";
}

/**
 * Never trust the browser-provided relative path. Folder names are retained,
 * traversal segments are removed, and the real uploaded filename is always
 * used as the final segment.
 */
export function safeDeliveryRelativePath(rawPath: string | undefined, fileName: string) {
  const submitted = (rawPath || "").replaceAll("\\", "/").split("/");
  const folders = submitted
    .slice(0, -1)
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .slice(0, 20)
    .map(safePathSegment);
  return [...folders, safePathSegment(fileName)].join("/").slice(0, 1200);
}

export async function completeClientDeliveryChunkUpload(
  delivery: ClientDeliveryRow,
  input: {
    uploadId: string;
    fileName: string;
    relativePath: string;
    fileSize: number;
    chunkCount: number;
    chunkBytes: number;
  },
) {
  const db = getGlashDbAdmin() as any;
  const bucket = delivery.delivery_type === "brand_identity"
    ? BRAND_IDENTITY_BUCKET
    : CLIENT_DELIVERABLES_BUCKET;
  const pendingPaths = Array.from(
    { length: input.chunkCount },
    (_, index) => `pending/client-deliveries/${delivery.id}/${input.uploadId}/${index}`,
  );
  const buffers: Buffer[] = [];

  for (const [index, path] of pendingPaths.entries()) {
    const { data, error } = await db.storage.from(bucket).download(path);
    if (error || !data) {
      throw new DeliveryWorkflowError(`Upload chunk ${index + 1} of ${input.chunkCount} is missing. Retry this file.`, 409);
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    const expectedBytes = Math.min(input.chunkBytes, input.fileSize - (index * input.chunkBytes));
    if (buffer.length !== expectedBytes) {
      throw new DeliveryWorkflowError(`Upload chunk ${index + 1} is incomplete. Retry this file.`, 409);
    }
    buffers.push(buffer);
  }

  const assembled = Buffer.concat(buffers);
  if (assembled.length !== input.fileSize) {
    throw new DeliveryWorkflowError("The uploaded file is incomplete. Retry it.", 409);
  }

  let safe: Awaited<ReturnType<typeof assertSafeUpload>>;
  const relativePath = safeDeliveryRelativePath(input.relativePath, input.fileName);
  try {
    safe = await assertSafeUpload(
      {
        name: input.fileName,
        size: assembled.length,
        type: "application/octet-stream",
        arrayBuffer: async () => Uint8Array.from(assembled).buffer,
      },
      {
        allow: ["image", "pdf", "office", "zip", "design"],
        maxBytes: deliveryFileMaximumBytes(input.fileName),
      },
    );
  } catch (error) {
    await db.storage.from(bucket).remove(pendingPaths).catch(() => undefined);
    if (error instanceof UploadSecurityError) {
      throw new UploadSecurityError(`${relativePath}: ${error.message}`, error.status);
    }
    throw error;
  }

  const existing = await glashQuery<{
    id: string;
    storage_bucket: string;
    storage_path: string;
    position: number;
  }>(
    `select id, storage_bucket, storage_path, position
       from public.client_delivery_files
      where delivery_id = $1 and relative_path = $2
      order by created_at desc, id desc`,
    [delivery.id, relativePath],
  );
  const [{ count = 0 } = { count: 0 }] = await glashQuery<{ count: number }>(
    "select count(*)::int as count from public.client_delivery_files where delivery_id = $1",
    [delivery.id],
  );
  if (!existing.length && Number(count) >= MAX_DELIVERY_FILES) {
    await db.storage.from(bucket).remove(pendingPaths).catch(() => undefined);
    throw new DeliveryWorkflowError(`A delivery can contain up to ${MAX_DELIVERY_FILES} uploaded files.`);
  }

  const finalPath = `workflow/${delivery.id}/${input.uploadId}-${safeFileBase(input.fileName)}.${safe.ext}`;
  const { error: uploadError } = await db.storage
    .from(bucket)
    .upload(finalPath, safe.buffer, { contentType: safe.contentType, upsert: true });
  if (uploadError) throw new DeliveryWorkflowError(uploadError.message, 500);

  try {
    const primary = existing[0] || null;
    const position = primary?.position ?? Number(count || 0);
    let fileId: string;
    if (primary) {
      await glashQuery(
        `update public.client_delivery_files
            set file_name = $2, relative_path = $3, storage_bucket = $4,
                storage_path = $5, mime_type = $6, file_size = $7,
                file_kind = $8, position = $9
          where id = $1`,
        [
          primary.id,
          input.fileName.slice(0, 180),
          relativePath,
          bucket,
          finalPath,
          safe.contentType,
          safe.buffer.length,
          safe.kind === "zip" ? "archive" : safe.kind,
          position,
        ],
      );
      fileId = primary.id;
    } else {
      const [inserted] = await glashQuery<{ id: string }>(
        `insert into public.client_delivery_files
          (delivery_id, file_name, relative_path, storage_bucket, storage_path, mime_type, file_size, file_kind, position)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning id`,
        [
          delivery.id,
          input.fileName.slice(0, 180),
          relativePath,
          bucket,
          finalPath,
          safe.contentType,
          safe.buffer.length,
          safe.kind === "zip" ? "archive" : safe.kind,
          position,
        ],
      );
      fileId = inserted.id;
    }

    const duplicateIds = existing.slice(1).map((file) => file.id);
    if (duplicateIds.length) {
      await glashQuery(
        "delete from public.client_delivery_files where id = any($1::uuid[])",
        [duplicateIds],
      );
    }

    const obsoletePaths = existing
      .map((file) => ({ bucket: file.storage_bucket, path: file.storage_path }))
      .filter((file) => file.path !== finalPath);
    for (const obsolete of obsoletePaths) {
      await db.storage.from(obsolete.bucket).remove([obsolete.path]).catch(() => undefined);
    }
    await db.storage.from(bucket).remove(pendingPaths).catch(() => undefined);

    if (safe.kind === "image") {
      after(async () => {
        await getOrCreateDeliveryImagePreview({
          bucket,
          fileId,
          sourcePath: finalPath,
          sourceBuffer: safe.buffer,
        }).catch((error) => {
          console.error("[delivery/upload] preview preparation failed", {
            deliveryId: delivery.id,
            fileId,
            error: error instanceof Error ? error.message : "Unknown preview error",
          });
        });
      });
    }

    return {
      id: fileId,
      fileName: input.fileName.slice(0, 180),
      relativePath,
      fileSize: safe.buffer.length,
      mimeType: safe.contentType,
      replaced: Boolean(primary),
    };
  } catch (error) {
    await db.storage.from(bucket).remove([finalPath]).catch(() => undefined);
    throw error;
  }
}

export async function getClientDelivery(id: string) {
  return glashMaybeOne<ClientDeliveryRow>(
    `select id, delivery_type, title, description, status, project_id,
            client_user_id, manual_client_id, assigned_team_lead_id,
            submitted_by_team_member_id, submitted_by_admin,
            external_url, cover_storage_bucket, cover_storage_path,
            cover_mime_type, cover_updated_at,
            brand_identity_delivery_id, created_by
       from public.client_deliveries
      where id = $1
      limit 1`,
    [id],
  );
}

export async function uploadClientDeliveryFiles(
  delivery: ClientDeliveryRow,
  files: File[],
  relativePaths: string[] = [],
) {
  const [{ count = 0 } = { count: 0 }] = await glashQuery<{ count: number }>(
    "select count(*)::int as count from public.client_delivery_files where delivery_id = $1",
    [delivery.id],
  );
  if (Number(count) + files.length > MAX_DELIVERY_FILES) {
    throw new DeliveryWorkflowError(`A delivery can contain up to ${MAX_DELIVERY_FILES} uploaded files.`);
  }
  const batchBytes = files.reduce((total, file) => total + file.size, 0);
  if (batchBytes > MAX_DELIVERY_BATCH_BYTES) {
    throw new DeliveryWorkflowError("The combined upload is larger than the 200MB request limit.", 413);
  }
  const db = getGlashDbAdmin() as any;
  const bucket = delivery.delivery_type === "brand_identity"
    ? BRAND_IDENTITY_BUCKET
    : CLIENT_DELIVERABLES_BUCKET;
  let position = Number(count || 0);

  // Validate the complete selection before storing anything. One unsupported
  // asset should never leave a half-uploaded client folder behind.
  const validatedFiles: Array<{
    file: File;
    relativePath: string;
    safe: Awaited<ReturnType<typeof assertSafeUpload>>;
  }> = [];
  for (const [fileIndex, file] of files.entries()) {
    const relativePath = safeDeliveryRelativePath(relativePaths[fileIndex], file.name);
    try {
      const safe = await assertSafeUpload(file, {
        allow: ["image", "pdf", "office", "zip", "design"],
        maxBytes: deliveryFileMaximumBytes(file.name),
      });
      validatedFiles.push({ file, relativePath, safe });
    } catch (error) {
      if (error instanceof UploadSecurityError) {
        throw new UploadSecurityError(`${relativePath}: ${error.message}`, error.status);
      }
      throw error;
    }
  }

  for (const { file, relativePath, safe } of validatedFiles) {
    const path = `workflow/${delivery.id}/${crypto.randomUUID()}-${safeFileBase(file.name)}.${safe.ext}`;
    const { error: uploadError } = await db.storage
      .from(bucket)
      .upload(path, safe.buffer, { contentType: safe.contentType, upsert: false });
    if (uploadError) throw new DeliveryWorkflowError(uploadError.message, 500);

    try {
      const [inserted] = await glashQuery<{ id: string }>(
        `insert into public.client_delivery_files
          (delivery_id, file_name, relative_path, storage_bucket, storage_path, mime_type, file_size, file_kind, position)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning id`,
        [
          delivery.id,
          file.name.slice(0, 180),
          relativePath,
          bucket,
          path,
          safe.contentType,
          safe.buffer.length,
          safe.kind === "zip" ? "archive" : safe.kind,
          position,
        ],
      );
      if (safe.kind === "image") {
        after(async () => {
          await getOrCreateDeliveryImagePreview({
            bucket,
            fileId: inserted.id,
            sourcePath: path,
            sourceBuffer: safe.buffer,
          }).catch((error) => {
            console.error("[delivery/upload] preview preparation failed", {
              deliveryId: delivery.id,
              fileId: inserted.id,
              error: error instanceof Error ? error.message : "Unknown preview error",
            });
          });
        });
      }
      position += 1;
    } catch (error) {
      await db.storage.from(bucket).remove([path]);
      throw error;
    }
  }
}

export type ClientDeliveryFileRemoval = {
  id: string;
  file_name: string;
  relative_path: string | null;
  storage_bucket: string;
  storage_path: string;
  file_size: number;
  file_kind: string;
};

/** Resolve removal targets and reject stale IDs or an accidentally empty handover. */
export async function planClientDeliveryFileRemoval(input: {
  deliveryId: string;
  fileIds: string[];
  incomingFileCount?: number;
  hasExternalUrl: boolean;
}) {
  const fileIds = Array.from(new Set(input.fileIds));
  if (!fileIds.length) return [];

  const files = await glashQuery<ClientDeliveryFileRemoval>(
    `select id, file_name, relative_path, storage_bucket, storage_path,
            file_size::bigint::text, file_kind
       from public.client_delivery_files
      where delivery_id = $1
        and id = any($2::uuid[])
      order by position, created_at`,
    [input.deliveryId, fileIds],
  );
  if (files.length !== fileIds.length) {
    throw new DeliveryWorkflowError(
      "One of the attached files changed before this update. Reload the delivery and try again.",
      409,
    );
  }

  const [{ remaining = 0 } = { remaining: 0 }] = await glashQuery<{ remaining: number }>(
    `select count(*)::int as remaining
       from public.client_delivery_files
      where delivery_id = $1
        and not (id = any($2::uuid[]))`,
    [input.deliveryId, fileIds],
  );
  if (
    Number(remaining) + Number(input.incomingFileCount || 0) === 0
    && !input.hasExternalUrl
  ) {
    throw new DeliveryWorkflowError(
      "Keep at least one attached file or add a Google Drive/Docs link before removing these files.",
    );
  }

  return files.map((file) => ({ ...file, file_size: Number(file.file_size || 0) }));
}

async function retireDeliveryStorageObject(bucket: string, path: string) {
  const storage = (getGlashDbAdmin() as any).storage.from(bucket);
  const removed = await storage.remove([path]);
  if (!removed.error) return;

  // Some compatible providers reject the standard bulk-delete request. Once
  // the DB row has revoked access, overwrite the private object so the deleted
  // client asset is not retained as recoverable content.
  const retired = await storage.upload(
    path,
    Buffer.from("This client delivery file has been deleted."),
    { contentType: "application/octet-stream", cacheControl: "0", upsert: true },
  );
  if (retired.error) throw new Error(retired.error.message);
}

export async function retireClientDeliveryFileObjects(
  deliveryId: string,
  files: ClientDeliveryFileRemoval[],
) {
  if (!files.length) return;
  await Promise.all(files.flatMap((file) => {
    const paths = [file.storage_path];
    if (file.file_kind === "image") {
      paths.push(deliveryPreviewPath(file.id, deliveryPreviewVersion(file.storage_path)));
    }
    return paths.map((path) => retireDeliveryStorageObject(file.storage_bucket, path));
  })).catch((error) => {
    console.error("[delivery/files] private object retirement failed", {
      deliveryId,
      fileCount: files.length,
      error: error instanceof Error ? error.message : "Unknown storage cleanup error",
    });
  });
}

/** Revoke file rows first, then remove or securely retire their private objects. */
export async function removeClientDeliveryFiles(
  deliveryId: string,
  files: ClientDeliveryFileRemoval[],
) {
  if (!files.length) return [];
  const deleted = await glashQuery<ClientDeliveryFileRemoval>(
    `delete from public.client_delivery_files
      where delivery_id = $1
        and id = any($2::uuid[])
      returning id, file_name, relative_path, storage_bucket, storage_path,
                file_size::bigint::text, file_kind`,
    [deliveryId, files.map((file) => file.id)],
  );
  if (deleted.length !== files.length) {
    throw new DeliveryWorkflowError(
      "The attached files changed before they could be removed. Reload the delivery and try again.",
      409,
    );
  }

  after(async () => {
    await retireClientDeliveryFileObjects(deliveryId, deleted);
  });

  return deleted.map((file) => ({ ...file, file_size: Number(file.file_size || 0) }));
}

/**
 * Duplicate an existing delivery for an additional recipient. Each recipient
 * gets its own client_deliveries row (so it lands in their own account) and
 * its own physical copies of the files, while `delivery_group_id` links the
 * siblings for auditing. The new row starts in 'draft' so the caller can run
 * it through submit + publish exactly like a fresh delivery.
 */
export async function cloneClientDeliveryForRecipient(input: {
  source: ClientDeliveryRow;
  clientUserId: string | null;
  manualClientId: string | null;
  createdBy: string;
  groupId: string;
}) {
  const { source } = input;
  const [inserted] = await glashQuery<{ id: string }>(
    `insert into public.client_deliveries
       (delivery_type, title, description, status, project_id,
        client_user_id, manual_client_id, created_by, external_url, delivery_group_id)
     values ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9)
     returning id`,
    [
      source.delivery_type,
      source.title,
      source.description,
      source.project_id,
      input.clientUserId,
      input.manualClientId,
      input.createdBy,
      source.external_url,
      input.groupId,
    ],
  );
  const target = await getClientDelivery(inserted.id);
  if (!target) throw new DeliveryWorkflowError("Could not duplicate the delivery.", 500);

  const files = await glashQuery<{
    file_name: string; relative_path: string; storage_bucket: string; storage_path: string;
    mime_type: string | null; file_size: number | null; file_kind: string | null; position: number | null;
  }>(
    `select file_name, relative_path, storage_bucket, storage_path, mime_type, file_size, file_kind, position
       from public.client_delivery_files
      where delivery_id = $1
      order by position, created_at`,
    [source.id],
  );

  const db = getGlashDbAdmin() as any;
  if (source.cover_storage_bucket && source.cover_storage_path && source.cover_mime_type) {
    const coverPath = `workflow/${target.id}/cover/metadata.jpg`;
    const copied = await db.storage
      .from(source.cover_storage_bucket)
      .copy(source.cover_storage_path, coverPath);
    if (copied.error) {
      throw new DeliveryWorkflowError(`Could not copy the delivery cover for the extra recipient: ${copied.error.message}`, 500);
    }
    try {
      await glashQuery(
        `update public.client_deliveries
            set cover_storage_bucket = $2, cover_storage_path = $3,
                cover_mime_type = $4, cover_updated_at = now(), updated_at = now()
          where id = $1`,
        [target.id, source.cover_storage_bucket, coverPath, source.cover_mime_type],
      );
      target.cover_storage_bucket = source.cover_storage_bucket;
      target.cover_storage_path = coverPath;
      target.cover_mime_type = source.cover_mime_type;
      target.cover_updated_at = new Date().toISOString();
    } catch (error) {
      await scrubClientDeliveryCoverObject(source.cover_storage_bucket, coverPath).catch(() => undefined);
      throw error;
    }
  }
  for (const file of files) {
    const suffix = file.storage_path.split("/").pop() || `${safeFileBase(file.file_name)}`;
    const newPath = `workflow/${target.id}/${crypto.randomUUID()}-${suffix}`;
    const { error } = await db.storage.from(file.storage_bucket).copy(file.storage_path, newPath);
    if (error) throw new DeliveryWorkflowError(`Could not copy the finished files for the extra recipient: ${error.message}`, 500);
    await glashQuery(
      `insert into public.client_delivery_files
        (delivery_id, file_name, relative_path, storage_bucket, storage_path, mime_type, file_size, file_kind, position)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [target.id, file.file_name, file.relative_path || file.file_name, file.storage_bucket, newPath, file.mime_type, file.file_size, file.file_kind, file.position ?? 0],
    );
  }
  return target;
}

export async function submitClientDelivery(input: {
  id: string;
  externalUrl?: string | null;
  teamMemberId?: string | null;
  adminEmail?: string | null;
}) {
  const delivery = await getClientDelivery(input.id);
  if (!delivery) throw new DeliveryWorkflowError("Delivery was not found.", 404);
  if (!["draft", "assigned", "revision_requested"].includes(delivery.status)) {
    throw new DeliveryWorkflowError("This delivery is not open for submission.", 409);
  }

  const externalUrl = cleanDeliveryText(input.externalUrl, 1000);
  if (externalUrl && delivery.delivery_type !== "design") {
    throw new DeliveryWorkflowError("Google Drive links are available for design deliverables.");
  }
  if (externalUrl && !isGoogleDeliverableUrl(externalUrl)) {
    throw new DeliveryWorkflowError("Use a valid Google Drive or Google Docs file/folder link.");
  }

  const [{ file_count = 0 } = { file_count: 0 }] = await glashQuery<{ file_count: number }>(
    "select count(*)::int as file_count from public.client_delivery_files where delivery_id = $1",
    [delivery.id],
  );
  const effectiveUrl = externalUrl || delivery.external_url;
  if (!file_count && !effectiveUrl) {
    throw new DeliveryWorkflowError("Upload at least one file or add a Google Drive link before submitting.");
  }
  if (delivery.delivery_type === "brand_identity" && !file_count) {
    throw new DeliveryWorkflowError("A brand identity submission must include at least one uploaded file.");
  }

  await glashQuery(
    `update public.client_deliveries
        set status = 'submitted',
            external_url = $2,
            submitted_by_team_member_id = $3,
            submitted_by_admin = $4,
            submitted_at = now(),
            revision_note = null,
            updated_at = now()
      where id = $1`,
    [delivery.id, effectiveUrl || null, input.teamMemberId || null, input.adminEmail || null],
  );
  return getClientDelivery(delivery.id);
}

export async function publishClientDelivery(input: {
  id: string;
  clientUserId: string;
  approverEmail: string;
  approverMemberId?: string | null;
  approvalNote?: string | null;
}) {
  const client = await glashPool.connect();
  let leadId: string | null = null;
  let title = "New deliverable";
  let deliveryType: ClientDeliveryType = "design";
  try {
    await client.query("begin");
    const result = await client.query<ClientDeliveryRow>(
      `select * from public.client_deliveries where id = $1 for update`,
      [input.id],
    );
    const delivery = result.rows[0];
    if (!delivery) throw new DeliveryWorkflowError("Delivery was not found.", 404);
    if (delivery.status !== "submitted") {
      throw new DeliveryWorkflowError("Only submitted work can be approved.", 409);
    }
    if (
      input.approverMemberId
      && delivery.submitted_by_team_member_id
      && input.approverMemberId === delivery.submitted_by_team_member_id
    ) {
      throw new DeliveryWorkflowError("The person who submitted this work cannot approve it.", 403);
    }
    if (
      delivery.submitted_by_admin
      && delivery.submitted_by_admin.toLowerCase() === input.approverEmail.toLowerCase()
    ) {
      throw new DeliveryWorkflowError("The admin who submitted this work cannot approve it.", 403);
    }

    const profileResult = await client.query<{ id: string; email: string | null; full_name: string | null; company_name: string | null }>(
      "select id, email, full_name, company_name from public.profiles where id = $1 limit 1",
      [input.clientUserId],
    );
    const profile = profileResult.rows[0];
    if (!profile) throw new DeliveryWorkflowError("Choose a valid client account.", 404);

    let brandIdentityId: string | null = null;
    if (delivery.delivery_type === "brand_identity") {
      if (!delivery.project_id) {
        throw new DeliveryWorkflowError("Choose a project before approving a brand identity.", 409);
      }
      const fileCount = await client.query<{ count: number }>(
        `select count(*)::int as count
           from public.client_delivery_files
          where delivery_id = $1 and storage_bucket = $2`,
        [delivery.id, BRAND_IDENTITY_BUCKET],
      );
      if (!Number(fileCount.rows[0]?.count || 0)) {
        throw new DeliveryWorkflowError("The brand identity has no uploaded files.", 409);
      }

      const projectResult = await client.query<{ id: string }>(
        "select id from public.finance_projects where id = $1 limit 1",
        [delivery.project_id],
      );
      if (!projectResult.rows[0]) throw new DeliveryWorkflowError("The selected project no longer exists.", 404);
      await client.query(
        `update public.finance_projects
            set user_id = $2,
                client = coalesce($3, $4, client),
                client_email = coalesce($5, client_email),
                status = 'completed',
                completion_date = coalesce(completion_date, current_date),
                updated_at = now()
          where id = $1`,
        [delivery.project_id, profile.id, profile.company_name, profile.full_name, profile.email],
      );

      const existingIdentity = await client.query<{ id: string }>(
        "select id from public.brand_identity_deliveries where project_id = $1 limit 1",
        [delivery.project_id],
      );
      if (existingIdentity.rows[0]) {
        brandIdentityId = existingIdentity.rows[0].id;
        await client.query(
          `update public.brand_identity_deliveries
              set user_id = $2, title = $3, description = $4,
                  is_public = true, published_at = coalesce(published_at, now()),
                  created_by = coalesce(created_by, $5), updated_at = now()
            where id = $1`,
          [brandIdentityId, profile.id, delivery.title, delivery.description, input.approverEmail],
        );
      } else {
        const inserted = await client.query<{ id: string }>(
          `insert into public.brand_identity_deliveries
            (user_id, project_id, title, description, is_public, published_at, created_by)
           values ($1,$2,$3,$4,true,now(),$5)
           returning id`,
          [profile.id, delivery.project_id, delivery.title, delivery.description, input.approverEmail],
        );
        brandIdentityId = inserted.rows[0].id;
      }

      await client.query(
        `insert into public.brand_identity_delivery_files
          (delivery_id, file_name, storage_path, mime_type, file_size, file_kind, position)
         select $2, file_name, storage_path, mime_type, file_size, file_kind, position
           from public.client_delivery_files
          where delivery_id = $1 and storage_bucket = $3
         on conflict (storage_path) do nothing`,
        [delivery.id, brandIdentityId, BRAND_IDENTITY_BUCKET],
      );
    }

    await client.query(
      `update public.client_deliveries
          set client_user_id = $2,
              status = 'published',
              approved_by = $3,
              approval_note = $4,
              approved_at = now(),
              published_at = now(),
              brand_identity_delivery_id = $5,
              updated_at = now()
        where id = $1`,
      [delivery.id, profile.id, input.approverEmail, cleanDeliveryText(input.approvalNote, 2000) || null, brandIdentityId],
    );

    const notificationType = delivery.delivery_type === "brand_identity" ? "brand_identity" : "new_delivery";
    const notificationLink = delivery.delivery_type === "brand_identity"
      ? "/dashboard/brand-identity"
      : "/dashboard/documents";
    await client.query(
      `insert into public.notifications (user_id, type, title, message, link)
       values ($1,$2,$3,$4,$5)`,
      [
        profile.id,
        notificationType,
        delivery.delivery_type === "brand_identity" ? "New brand identity" : "New design deliverable",
        `${delivery.title} is now available in your account.`,
        notificationLink,
      ],
    );

    if (delivery.assigned_team_lead_id) {
      await client.query(
        `insert into public.team_notifications
          (recipient_id, kind, title, body, link, actor_is_admin)
         values ($1,'delivery_approved','Work approved',$2,'/team/deliveries',true)`,
        [delivery.assigned_team_lead_id, `${delivery.title} was approved and sent to the client.`],
      );
    }
    await client.query("commit");
    leadId = delivery.assigned_team_lead_id;
    title = delivery.title;
    deliveryType = delivery.delivery_type;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const email = await deliverClientDeliveryEmail(input.id);
  return { id: input.id, leadId, title, deliveryType, email };
}
