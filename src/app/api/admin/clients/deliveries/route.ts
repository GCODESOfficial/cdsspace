import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { UploadSecurityError } from "@/lib/upload-security";
import {
  cleanDeliveryText,
  cloneClientDeliveryForRecipient,
  DeliveryWorkflowError,
  getClientDelivery,
  planClientDeliveryFileRemoval,
  publishClientDelivery,
  removeClientDeliveryFiles,
  retireClientDeliveryFileObjects,
  submitClientDelivery,
  uploadClientDeliveryFiles,
  type ClientDeliveryFileRemoval,
  type ClientDeliveryRow,
} from "@/lib/client-deliveries-server";
import { isGoogleDeliverableUrl, isIgnoredDeliveryPath, type ClientDeliveryType } from "@/lib/client-deliveries";
import { getUnifiedClientDirectory } from "@/lib/client-directory-server";
import { logActivity } from "@/lib/activity-log";
import { deliverClientDeliveryEmail } from "@/lib/client-delivery-email";
import { replaceClientDeliveryCover, scrubClientDeliveryCoverObject } from "@/lib/delivery-covers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function can(session: { role: string; permissions: string[] }, permission: string) {
  return session.role === "super_admin" || hasPermission(session.permissions, permission);
}

async function logFileUpload(input: {
  deliveryId: string;
  title: string;
  files: File[];
  filePaths: string[];
  deliveryType: ClientDeliveryType;
  projectId: string | null;
  recipient?: string | null;
}) {
  if (!input.files.length) return;
  await logActivity({
    action: "delivery.files_uploaded",
    page: "clients/deliveries",
    resource_type: "client_delivery",
    resource_id: input.deliveryId,
    resource_label: input.title,
    metadata: {
      destination: "Sales Hub / Client Deliveries",
      recipient: input.recipient || null,
      delivery_type: input.deliveryType,
      project_id: input.projectId,
      file_count: input.files.length,
      files: input.files.map((file, index) => ({
        name: file.name,
        relative_path: input.filePaths[index] || file.name,
        size: file.size,
        type: file.type || null,
      })),
    },
  });
}

async function logFileRemoval(input: {
  deliveryId: string;
  title: string;
  files: Array<{ id: string; file_name: string; relative_path: string | null; file_size: number }>;
  removedBy: string;
}) {
  if (!input.files.length) return;
  await logActivity({
    action: "delivery.files_removed",
    page: "clients/deliveries",
    resource_type: "client_delivery",
    resource_id: input.deliveryId,
    resource_label: input.title,
    metadata: {
      removed_by: input.removedBy,
      file_count: input.files.length,
      files: input.files.map((file) => ({
        id: file.id,
        name: file.file_name,
        relative_path: file.relative_path || file.file_name,
        size: file.file_size,
      })),
    },
  });
}

function errorResponse(error: unknown, fallback: string) {
  const status = error instanceof DeliveryWorkflowError || error instanceof UploadSecurityError
    ? error.status
    : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}

async function resolveRecipient(reference: string) {
  const [kind, id] = reference.split(":", 2);
  if (!id || !["manual", "profile"].includes(kind)) {
    throw new DeliveryWorkflowError("Choose the client receiving this delivery.");
  }
  if (kind === "profile") {
    const profile = await glashMaybeOne<{ id: string; email: string; full_name: string | null; company_name: string | null }>(
      "select id, email, full_name, company_name from public.profiles where id = $1 and email_verified_at is not null and account_status = 'active' limit 1",
      [id],
    );
    if (!profile) throw new DeliveryWorkflowError("The selected platform client no longer exists.", 404);
    return { manualClientId: null, clientUserId: profile.id, name: profile.company_name || profile.full_name || profile.email };
  }
  const client = await glashMaybeOne<{
    id: string; name: string; brand_name: string | null; platform_user_id: string | null;
  }>(
    "select id, name, brand_name, platform_user_id from public.clients where id = $1 limit 1",
    [id],
  );
  if (!client) throw new DeliveryWorkflowError("The selected CRM client no longer exists.", 404);
  return {
    manualClientId: client.id,
    clientUserId: client.platform_user_id,
    name: client.brand_name || client.name,
  };
}

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "deliveries");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [{ clients }, deliveries, projects] = await Promise.all([
      getUnifiedClientDirectory(),
      glashQuery(
        `select d.id, d.delivery_type, d.title, d.description, d.status,
                d.project_id, d.client_user_id, d.manual_client_id,
                d.external_url, d.delivery_group_id, d.created_at,
                d.published_at, d.public_token,
                case when d.cover_storage_path is not null
                  then (extract(epoch from d.cover_updated_at) * 1000)::bigint::text
                  else null
                end as cover_version,
                coalesce(p.company_name, p.full_name, p.email, c.brand_name, c.name) as client_name,
                fp.name as project_name,
                coalesce(files.file_count, 0)::int as file_count,
                coalesce(files.file_names, array[]::text[]) as file_names,
                coalesce(files.attached_files, '[]'::jsonb) as attached_files
           from public.client_deliveries d
           left join public.profiles p on p.id = d.client_user_id
           left join public.clients c on c.id = d.manual_client_id
           left join public.finance_projects fp on fp.id = d.project_id
           left join lateral (
             select count(*)::int as file_count,
                    array_agg(coalesce(nullif(f.relative_path, ''), f.file_name) order by f.position, f.created_at) as file_names,
                    jsonb_agg(
                      jsonb_build_object(
                        'id', f.id,
                        'file_name', f.file_name,
                        'relative_path', coalesce(nullif(f.relative_path, ''), f.file_name),
                        'file_size', f.file_size,
                        'mime_type', f.mime_type,
                        'file_kind', f.file_kind
                      )
                      order by f.position, f.created_at
                    ) as attached_files
               from public.client_delivery_files f
              where f.delivery_id = d.id
           ) files on true
          order by d.created_at desc
          limit 200`,
      ),
      glashQuery(
        `select id, name, client, status
           from public.finance_projects
          order by created_at desc
          limit 250`,
      ),
    ]);
    return NextResponse.json({
      deliveries,
      clients,
      projects,
      capabilities: {
        create: can(session, "deliveries.create"),
        send: can(session, "deliveries.send"),
        editPublished: can(session, "deliveries.send"),
        archive: can(session, "deliveries.send"),
        deleteDraft: can(session, "deliveries.create"),
      },
    });
  } catch (error) {
    return errorResponse(error, "Could not load client deliveries.");
  }
}

export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "deliveries");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminEmail = session.email;
  const adminName = session.name || session.email;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid delivery payload." }, { status: 400 });

  const requestedIntent = cleanDeliveryText(form.get("intent"), 10);
  const intent: "draft" | "upload" | "send" | "update" = requestedIntent === "draft"
    ? "draft"
    : requestedIntent === "upload"
      ? "upload"
      : requestedIntent === "update"
        ? "update"
        : "send";
  if (intent === "draft" && !can(session, "deliveries.create")) {
    return NextResponse.json({ error: "You do not have clearance to create or edit delivery drafts." }, { status: 403 });
  }
  // A direct send with many files is staged across several proxy-safe upload
  // requests before it is published. Either preparation or send clearance is
  // sufficient because the final publish request still enforces send access.
  if (intent === "upload" && !can(session, "deliveries.create") && !can(session, "deliveries.send")) {
    return NextResponse.json({ error: "You do not have clearance to upload client delivery files." }, { status: 403 });
  }
  if (intent === "send" && !can(session, "deliveries.send")) {
    return NextResponse.json({ error: "You do not have approval clearance to send work to clients." }, { status: 403 });
  }
  if (intent === "update" && !can(session, "deliveries.send")) {
    return NextResponse.json({ error: "You do not have clearance to edit a client delivery." }, { status: 403 });
  }
  const existingId = cleanDeliveryText(form.get("delivery_id"), 80) || null;
  const removeFileIds = Array.from(new Set(
    form.getAll("remove_file_id").map((value) => cleanDeliveryText(value, 80)).filter(Boolean),
  ));
  if (removeFileIds.some((id) => !UUID_PATTERN.test(id))) {
    return NextResponse.json({ error: "One of the selected attached files is invalid." }, { status: 400 });
  }
  if (removeFileIds.length && !existingId) {
    return NextResponse.json({ error: "Save the delivery before removing attached files." }, { status: 400 });
  }
  const deliveryType = cleanDeliveryText(form.get("delivery_type"), 40) as ClientDeliveryType;
  const title = cleanDeliveryText(form.get("title"), 180);
  const description = cleanDeliveryText(form.get("description"), 4000) || null;
  const projectId = cleanDeliveryText(form.get("project_id"), 80) || null;
  const externalUrl = cleanDeliveryText(form.get("external_url"), 1000) || null;
  const submittedFiles = form.getAll("files");
  const submittedCover = form.get("cover_image");
  const coverFile = submittedCover instanceof File && submittedCover.size > 0
    ? submittedCover
    : null;
  if (submittedCover !== null && !(submittedCover instanceof File)) {
    return NextResponse.json({ error: "Choose a valid image for the delivery cover." }, { status: 400 });
  }
  const submittedPaths = form.getAll("file_paths").map((entry) => cleanDeliveryText(entry, 1400));
  const files: File[] = [];
  const filePaths: string[] = [];
  submittedFiles.forEach((entry, index) => {
    const relativePath = submittedPaths[index] || (entry instanceof File ? entry.name : "");
    if (entry instanceof File && entry.size > 0 && !isIgnoredDeliveryPath(relativePath)) {
      files.push(entry);
      filePaths.push(relativePath);
    }
  });
  // Primary + any additional recipients ("send the same work to another client").
  const recipientRefs = Array.from(
    new Set(form.getAll("client_reference").map((value) => cleanDeliveryText(value, 120)).filter(Boolean)),
  );

  if (!["brand_identity", "design"].includes(deliveryType)) {
    return NextResponse.json({ error: "Choose a valid delivery type." }, { status: 400 });
  }
  if (title.length < 3) return NextResponse.json({ error: "Add a delivery title." }, { status: 400 });
  if (deliveryType === "brand_identity" && !projectId) {
    return NextResponse.json({ error: "Choose the completed project for this brand identity." }, { status: 400 });
  }
  if (externalUrl && (deliveryType !== "design" || !isGoogleDeliverableUrl(externalUrl))) {
    return NextResponse.json({ error: "Use a valid Google Drive or Google Docs link for design deliverables." }, { status: 400 });
  }

  // Load / validate an in-progress draft the caller is continuing.
  async function loadEditableDraft(id: string): Promise<ClientDeliveryRow> {
    const existing = await getClientDelivery(id);
    if (!existing) throw new DeliveryWorkflowError("That draft no longer exists.", 404);
    if (existing.status !== "draft") throw new DeliveryWorkflowError("This delivery has already been sent and can no longer be edited.", 409);
    return existing;
  }

  async function assertProjectExists() {
    if (!projectId) return;
    const project = await glashMaybeOne("select id from public.finance_projects where id = $1", [projectId]);
    if (!project) throw new DeliveryWorkflowError("The selected project was not found.", 404);
  }

  async function applyCoverIfProvided(delivery: ClientDeliveryRow) {
    if (!coverFile) return false;
    const replacing = Boolean(delivery.cover_storage_path);
    const cover = await replaceClientDeliveryCover(delivery, coverFile);
    await logActivity({
      action: replacing ? "delivery.cover_replaced" : "delivery.cover_uploaded",
      page: "clients/deliveries",
      resource_type: "client_delivery",
      resource_id: delivery.id,
      resource_label: title,
      metadata: {
        width: 1200,
        height: 630,
        bytes: cover.bytes,
        updated_by: adminName,
      },
    });
    return true;
  }

  // ---- Edit a completed handover without replacing or deleting its audit row ----
  if (intent === "update") {
    try {
      if (!existingId) throw new DeliveryWorkflowError("Choose the delivery to update.");
      await assertProjectExists();
      const existing = await getClientDelivery(existingId);
      if (!existing) throw new DeliveryWorkflowError("Delivery was not found.", 404);
      if (!["published", "awaiting_account"].includes(existing.status)) {
        throw new DeliveryWorkflowError("Only an active client delivery can be edited here.", 409);
      }
      if (existing.delivery_type !== deliveryType) {
        throw new DeliveryWorkflowError("The delivery type cannot be changed after a handover has been sent.", 409);
      }
      const removalPlan = await planClientDeliveryFileRemoval({
        deliveryId: existing.id,
        fileIds: removeFileIds,
        incomingFileCount: files.length,
        hasExternalUrl: Boolean(externalUrl),
      });

      await glashQuery(
        `update public.client_deliveries
            set title = $2, description = $3, project_id = $4,
                external_url = $5, updated_at = now()
          where id = $1`,
        [existing.id, title, description, projectId, externalUrl],
      );

      if (existing.brand_identity_delivery_id) {
        await glashQuery(
          `update public.brand_identity_deliveries
              set title = $2, description = $3, updated_at = now()
            where id = $1`,
          [existing.brand_identity_delivery_id, title, description],
        );
      }

      const updated = await getClientDelivery(existing.id);
      if (!updated) throw new DeliveryWorkflowError("Could not reload the updated delivery.", 500);
      const coverUpdated = await applyCoverIfProvided(updated);
      if (files.length) {
        await uploadClientDeliveryFiles(updated, files, filePaths);
        await logFileUpload({
          deliveryId: updated.id,
          title,
          files,
          filePaths,
          deliveryType,
          projectId,
        });
      }
      const removedFiles = await removeClientDeliveryFiles(updated.id, removalPlan);
      await logFileRemoval({
        deliveryId: updated.id,
        title,
        files: removedFiles,
        removedBy: adminName,
      });

      await logActivity({
        action: "delivery.updated",
        page: "clients/deliveries",
        resource_type: "client_delivery",
        resource_id: existing.id,
        resource_label: title,
        metadata: {
          previous_title: existing.title,
          delivery_type: deliveryType,
          project_id: projectId,
          added_file_count: files.length,
          removed_file_count: removedFiles.length,
          removed_files: removedFiles.map((file) => file.relative_path || file.file_name),
          cover_updated: coverUpdated,
          has_google_link: Boolean(externalUrl),
          updated_by: session.name || session.email,
        },
      });
      return NextResponse.json({ ok: true, status: existing.status, id: existing.id });
    } catch (error) {
      console.error("[sales-hub/deliveries] published update failed", { existingId, error });
      return errorResponse(error, "Could not update the client delivery.");
    }
  }

  // ---- Save/stage a draft (create or update), no submit / publish ----
  if (intent === "draft" || intent === "upload") {
    let draftId: string | null = existingId;
    try {
      await assertProjectExists();
      const primaryRef = recipientRefs[0] || null;
      const primary = primaryRef ? await resolveRecipient(primaryRef) : null;
      let draftRemovalPlan: Awaited<ReturnType<typeof planClientDeliveryFileRemoval>> = [];

      if (draftId) {
        await loadEditableDraft(draftId);
        draftRemovalPlan = await planClientDeliveryFileRemoval({
          deliveryId: draftId,
          fileIds: removeFileIds,
          incomingFileCount: files.length,
          hasExternalUrl: Boolean(externalUrl),
        });
        await glashQuery(
          `update public.client_deliveries
              set delivery_type = $2, title = $3, description = $4, project_id = $5,
                  external_url = $6, client_user_id = $7, manual_client_id = $8, updated_at = now()
            where id = $1`,
          [draftId, deliveryType, title, description, projectId, externalUrl, primary?.clientUserId ?? null, primary?.manualClientId ?? null],
        );
      } else {
        const [inserted] = await glashQuery<{ id: string }>(
          `insert into public.client_deliveries
            (delivery_type, title, description, status, project_id,
             client_user_id, manual_client_id, created_by, external_url)
           values ($1,$2,$3,'draft',$4,$5,$6,$7,$8)
           returning id`,
          [deliveryType, title, description, projectId, primary?.clientUserId ?? null, primary?.manualClientId ?? null, adminEmail, externalUrl],
        );
        draftId = inserted.id;
      }

      const draft = await getClientDelivery(draftId);
      if (!draft) throw new DeliveryWorkflowError("Could not save the draft.", 500);
      const coverUpdated = await applyCoverIfProvided(draft);
      if (files.length) {
        await uploadClientDeliveryFiles(draft, files, filePaths);
        await logFileUpload({
          deliveryId: draft.id,
          title,
          files,
          filePaths,
          deliveryType,
          projectId,
          recipient: primary?.name || null,
        });
      }
      const removedFiles = await removeClientDeliveryFiles(draft.id, draftRemovalPlan);
      await logFileRemoval({
        deliveryId: draft.id,
        title,
        files: removedFiles,
        removedBy: adminName,
      });

      await logActivity({
        action: "delivery.draft_saved",
        page: "clients/deliveries",
        resource_type: "client_delivery",
        resource_id: draftId,
        resource_label: title,
        metadata: {
          recipient: primary?.name || null,
          delivery_type: deliveryType,
          project_id: projectId,
          added_file_count: files.length,
          removed_file_count: removedFiles.length,
          removed_files: removedFiles.map((file) => file.relative_path || file.file_name),
          cover_updated: coverUpdated,
          has_google_link: Boolean(externalUrl),
        },
      });
      return NextResponse.json({ ok: true, status: "draft", id: draftId, recipient: primary?.name || null }, { status: existingId ? 200 : 201 });
    } catch (error) {
      console.error("[sales-hub/deliveries] draft save failed", { draftId, error });
      return errorResponse(error, "Could not save the draft.");
    }
  }

  // ---- Send to one or more clients ----
  if (!recipientRefs.length) {
    return NextResponse.json({ error: "Choose at least one receiving client." }, { status: 400 });
  }
  if (!existingId && !files.length && !externalUrl) {
    return NextResponse.json({ error: "Upload at least one finished file or add a Google Drive link." }, { status: 400 });
  }

  const groupId = recipientRefs.length > 1 ? crypto.randomUUID() : null;
  let baseId: string | null = existingId;

  async function finalizeDelivery(id: string, recipient: Awaited<ReturnType<typeof resolveRecipient>>, submitUrl: string | null) {
    await submitClientDelivery({ id, externalUrl: submitUrl ?? undefined, adminEmail: null });
    if (recipient.clientUserId) {
      await publishClientDelivery({
        id,
        clientUserId: recipient.clientUserId,
        approverEmail: adminEmail,
        approvalNote: groupId ? "Direct finished-work handover (multi-client) from Sales Hub." : "Direct finished-work handover from Sales Hub.",
      });
      return "published" as const;
    }
    await glashQuery("update public.client_deliveries set status = 'awaiting_account', updated_at = now() where id = $1", [id]);
    await deliverClientDeliveryEmail(id);
    return "awaiting_account" as const;
  }

  try {
    await assertProjectExists();
    const recipients = await Promise.all(recipientRefs.map((ref) => resolveRecipient(ref)));
    let sendRemovalPlan: Awaited<ReturnType<typeof planClientDeliveryFileRemoval>> = [];

    // Base delivery: reuse the resumed draft, or create a fresh row.
    if (baseId) {
      await loadEditableDraft(baseId);
      sendRemovalPlan = await planClientDeliveryFileRemoval({
        deliveryId: baseId,
        fileIds: removeFileIds,
        incomingFileCount: files.length,
        hasExternalUrl: Boolean(externalUrl),
      });
      await glashQuery(
        `update public.client_deliveries
            set delivery_type = $2, title = $3, description = $4, project_id = $5,
                external_url = $6, client_user_id = $7, manual_client_id = $8,
                delivery_group_id = $9, updated_at = now()
          where id = $1`,
        [baseId, deliveryType, title, description, projectId, externalUrl, recipients[0].clientUserId, recipients[0].manualClientId, groupId],
      );
    } else {
      const [inserted] = await glashQuery<{ id: string }>(
        `insert into public.client_deliveries
          (delivery_type, title, description, status, project_id,
           client_user_id, manual_client_id, created_by, external_url, delivery_group_id)
         values ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9)
         returning id`,
        [deliveryType, title, description, projectId, recipients[0].clientUserId, recipients[0].manualClientId, session.email, externalUrl, groupId],
      );
      baseId = inserted.id;
    }

    const base = await getClientDelivery(baseId);
    if (!base) throw new DeliveryWorkflowError("Could not prepare the delivery.", 500);
    const coverUpdated = await applyCoverIfProvided(base);
    const baseWithCover = coverUpdated ? await getClientDelivery(base.id) : base;
    if (!baseWithCover?.cover_storage_path) {
      throw new DeliveryWorkflowError("Upload a delivery cover before sending this handover.");
    }
    if (files.length) {
      await uploadClientDeliveryFiles(baseWithCover, files, filePaths);
      await logFileUpload({
        deliveryId: base.id,
        title,
        files,
        filePaths,
        deliveryType,
        projectId,
        recipient: recipients[0]?.name || null,
      });
    }
    const removedFiles = await removeClientDeliveryFiles(base.id, sendRemovalPlan);
    await logFileRemoval({
      deliveryId: base.id,
      title,
      files: removedFiles,
      removedBy: adminName,
    });

    const results: Array<{ id: string; recipient: string; status: "published" | "awaiting_account" }> = [];
    const baseStatus = await finalizeDelivery(base.id, recipients[0], externalUrl);
    results.push({ id: base.id, recipient: recipients[0].name, status: baseStatus });

    // Clone the finished work to each additional recipient.
    const baseForClone = await getClientDelivery(base.id);
    for (const recipient of recipients.slice(1)) {
      const clone = await cloneClientDeliveryForRecipient({
        source: baseForClone!,
        clientUserId: recipient.clientUserId,
        manualClientId: recipient.manualClientId,
        createdBy: session.email,
        groupId: groupId!,
      });
      const status = await finalizeDelivery(clone.id, recipient, null);
      results.push({ id: clone.id, recipient: recipient.name, status });
    }

    const published = results.filter((r) => r.status === "published").length;
    const held = results.length - published;
    const auditMetadata = {
      delivery_group_id: groupId,
      delivery_type: deliveryType,
      project_id: projectId,
      destination: "Client account",
      recipient_count: results.length,
      recipients: results.map((r) => ({ delivery_id: r.id, name: r.recipient, status: r.status })),
      resumed_from_draft: Boolean(existingId),
      removed_file_count: removedFiles.length,
      removed_files: removedFiles.map((file) => file.relative_path || file.file_name),
      cover_updated: coverUpdated,
      has_google_link: Boolean(externalUrl),
      approved_by: session.name || session.email,
      sent_by: session.name || session.email,
    };
    if (published > 0) {
      await logActivity({
        action: "delivery.approved",
        page: "clients/deliveries",
        resource_type: "client_delivery",
        resource_id: base.id,
        resource_label: title,
        metadata: { ...auditMetadata, approved_count: published },
      });
      await logActivity({
        action: "delivery.sent_to_client",
        page: "clients/deliveries",
        resource_type: "client_delivery",
        resource_id: base.id,
        resource_label: title,
        metadata: { ...auditMetadata, sent_count: published },
      });
    }
    if (held > 0) {
      await logActivity({
        action: "delivery.await_client_account",
        page: "clients/deliveries",
        resource_type: "client_delivery",
        resource_id: base.id,
        resource_label: title,
        metadata: { ...auditMetadata, held_count: held },
      });
    }
    return NextResponse.json(
      { ok: true, status: baseStatus, recipient: results[0].recipient, recipients: results, published, held, group_id: groupId },
      { status: 201 },
    );
  } catch (error) {
    console.error("[sales-hub/deliveries] create failed", { baseId, error });
    return errorResponse(error, "Could not send the client delivery.");
  }
}

export async function PATCH(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "deliveries.send");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = cleanDeliveryText(body.id, 80);
  const action = cleanDeliveryText(body.action, 20);
  const recipientReference = cleanDeliveryText(body.client_reference, 120);
  if (!id) {
    return NextResponse.json({ error: "Choose the delivery." }, { status: 400 });
  }
  try {
    const delivery = await getClientDelivery(id);
    if (!delivery) throw new DeliveryWorkflowError("Delivery was not found.", 404);

    if (action === "archive") {
      if (!["published", "awaiting_account"].includes(delivery.status)) {
        throw new DeliveryWorkflowError("Only an active client delivery can be archived.", 409);
      }
      await glashQuery(
        `update public.client_deliveries
            set archived_from_status = status,
                status = 'archived', archived_at = now(), archived_by = $2,
                public_access_revoked_at = now(), updated_at = now()
          where id = $1`,
        [id, session.email],
      );
      if (delivery.brand_identity_delivery_id) {
        await glashQuery(
          "update public.brand_identity_deliveries set is_public = false, updated_at = now() where id = $1",
          [delivery.brand_identity_delivery_id],
        );
      }
      await logActivity({
        action: "delivery.archived",
        page: "clients/deliveries",
        resource_type: "client_delivery",
        resource_id: id,
        resource_label: delivery.title,
        metadata: { archived_by: session.name || session.email, previous_status: delivery.status },
      });
      return NextResponse.json({ ok: true, status: "archived" });
    }

    if (action === "restore") {
      if (delivery.status !== "archived") {
        throw new DeliveryWorkflowError("Only an archived delivery can be restored.", 409);
      }
      const [restored] = await glashQuery<{ status: string }>(
        `update public.client_deliveries
            set status = case
                  when archived_from_status in ('published', 'awaiting_account') then archived_from_status
                  when client_user_id is not null then 'published'
                  else 'awaiting_account'
                end,
                archived_at = null, archived_by = null,
                public_access_revoked_at = null, updated_at = now()
          where id = $1
          returning status`,
        [id],
      );
      if (delivery.brand_identity_delivery_id && restored?.status === "published") {
        await glashQuery(
          "update public.brand_identity_deliveries set is_public = true, updated_at = now() where id = $1",
          [delivery.brand_identity_delivery_id],
        );
      }
      await logActivity({
        action: "delivery.restored",
        page: "clients/deliveries",
        resource_type: "client_delivery",
        resource_id: id,
        resource_label: delivery.title,
        metadata: { restored_by: session.name || session.email, status: restored?.status || "published" },
      });
      return NextResponse.json({ ok: true, status: restored?.status || "published" });
    }

    if (!recipientReference) {
      return NextResponse.json({ error: "Choose the receiving client." }, { status: 400 });
    }
    if (["published", "awaiting_account"].includes(delivery.status)) {
      throw new DeliveryWorkflowError("This handover has already been processed.", 409);
    }
    const recipient = await resolveRecipient(recipientReference);
    await glashQuery(
      `update public.client_deliveries
          set client_user_id = $2, manual_client_id = $3, updated_at = now()
        where id = $1`,
      [id, recipient.clientUserId, recipient.manualClientId],
    );
    if (["draft", "assigned", "revision_requested"].includes(delivery.status)) {
      await submitClientDelivery({ id, externalUrl: delivery.external_url, adminEmail: null });
    } else if (delivery.status !== "submitted") {
      throw new DeliveryWorkflowError("This legacy delivery is not ready to send.", 409);
    }
    let finalStatus: "published" | "awaiting_account" = "awaiting_account";
    if (recipient.clientUserId) {
      await publishClientDelivery({
        id,
        clientUserId: recipient.clientUserId,
        approverEmail: session.email,
        approvalNote: "Converted from the earlier workflow to a direct client handover.",
      });
      finalStatus = "published";
    } else {
      await glashQuery("update public.client_deliveries set status = 'awaiting_account', updated_at = now() where id = $1", [id]);
      await deliverClientDeliveryEmail(id);
    }
    const auditMetadata = {
      recipient: recipient.name,
      client_user_id: recipient.clientUserId,
      manual_client_id: recipient.manualClientId,
      destination: "Client account",
      approved_by: session.name || session.email,
      sent_by: session.name || session.email,
    };
    if (finalStatus === "published") {
      await logActivity({
        action: "delivery.approved",
        page: "clients/deliveries",
        resource_type: "client_delivery",
        resource_id: id,
        resource_label: delivery.title,
        metadata: auditMetadata,
      });
      await logActivity({
        action: "delivery.sent_to_client",
        page: "clients/deliveries",
        resource_type: "client_delivery",
        resource_id: id,
        resource_label: delivery.title,
        metadata: auditMetadata,
      });
    } else {
      await logActivity({
        action: "delivery.await_client_account",
        page: "clients/deliveries",
        resource_type: "client_delivery",
        resource_id: id,
        resource_label: delivery.title,
        metadata: auditMetadata,
      });
    }
    return NextResponse.json({ ok: true, status: finalStatus, recipient: recipient.name });
  } catch (error) {
    return errorResponse(error, "Could not send the existing delivery.");
  }
}

export async function DELETE(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "deliveries.create");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = cleanDeliveryText(new URL(req.url).searchParams.get("id"), 80);
  if (!id) return NextResponse.json({ error: "Choose the draft to delete." }, { status: 400 });

  try {
    const draft = await glashMaybeOne<{
      id: string;
      title: string;
      status: string;
      cover_storage_bucket: string | null;
      cover_storage_path: string | null;
    }>(
      `select id, title, status, cover_storage_bucket, cover_storage_path
         from public.client_deliveries where id = $1 limit 1`,
      [id],
    );
    if (!draft) throw new DeliveryWorkflowError("That saved draft no longer exists.", 404);
    if (draft.status !== "draft") {
      throw new DeliveryWorkflowError("Only saved drafts can be deleted from this section.", 409);
    }
    const storedFiles = await glashQuery<ClientDeliveryFileRemoval>(
      `select id, file_name, relative_path, storage_bucket, storage_path,
              file_size::bigint::text, file_kind
         from public.client_delivery_files
        where delivery_id = $1`,
      [id],
    );
    if (draft.cover_storage_bucket && draft.cover_storage_path) {
      await scrubClientDeliveryCoverObject(draft.cover_storage_bucket, draft.cover_storage_path);
    }
    const deleted = await glashQuery<{ id: string }>(
      "delete from public.client_deliveries where id = $1 and status = 'draft' returning id",
      [id],
    );
    if (!deleted.length) throw new DeliveryWorkflowError("The draft changed before it could be deleted.", 409);
    await retireClientDeliveryFileObjects(id, storedFiles);

    await logActivity({
      action: "delivery.draft_deleted",
      page: "clients/deliveries",
      resource_type: "client_delivery",
      resource_id: id,
      resource_label: draft.title,
      metadata: { removed_file_count: storedFiles.length, deleted_by: session.name || session.email },
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return errorResponse(error, "Could not delete the saved draft.");
  }
}
