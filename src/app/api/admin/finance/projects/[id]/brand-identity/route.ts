import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import { BRAND_IDENTITY_BUCKET, brandIdentityPublicPath } from "@/lib/brand-identity";
import { attachBrandIdentityFiles } from "@/lib/brand-identity-server";
import { absolutePublicUrl } from "@/lib/public-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILES_PER_UPLOAD = 10;

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeFileBase(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-120) || "brand-file";
}

function publicUrl(token: string) {
  return absolutePublicUrl(brandIdentityPublicPath(token));
}

async function loadProject(db: any, id: string) {
  const { data: project, error } = await db
    .from("finance_projects")
    .select("id, name, client, client_email, user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!project) return null;

  if (!project.user_id && project.client_email) {
    const { data: profile } = await db
      .from("profiles")
      .select("id")
      .ilike("email", project.client_email)
      .maybeSingle();
    if (profile?.id) {
      project.user_id = profile.id;
      await db.from("finance_projects").update({ user_id: profile.id }).eq("id", project.id);
    }
  }
  return project;
}

async function loadDelivery(db: any, projectId: string) {
  const { data, error } = await db
    .from("brand_identity_deliveries")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function responsePayload(db: any, project: any, delivery: any) {
  if (!delivery) return { project, delivery: null };
  const withFiles = await attachBrandIdentityFiles(db, {
    ...delivery,
    project_name: project.name,
    client_name: project.client,
  });
  return {
    project,
    delivery: {
      ...withFiles,
      public_url: delivery.is_public ? publicUrl(delivery.public_token) : null,
    },
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance.manage");
  if (denied) return denied;
  const { id } = await params;
  const db = financeDb();

  try {
    const project = await loadProject(db, id);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const delivery = await loadDelivery(db, id);
    return NextResponse.json(await responsePayload(db, project, delivery));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the brand identity delivery." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance.manage");
  if (denied) return denied;
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });

  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (!files.length) return NextResponse.json({ error: "Choose at least one completed brand file." }, { status: 400 });
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return NextResponse.json({ error: `Upload up to ${MAX_FILES_PER_UPLOAD} files at a time.` }, { status: 400 });
  }

  const db = financeDb();
  try {
    const project = await loadProject(db, id);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    if (!project.user_id) {
      return NextResponse.json({ error: "Link this project to a client account email before delivering files." }, { status: 409 });
    }

    let delivery = await loadDelivery(db, id);
    const title = cleanText(form.get("title"), 180) || delivery?.title || `${project.name} Brand Identity`;
    const description = cleanText(form.get("description"), 4000) || delivery?.description || null;

    if (!delivery) {
      const { data: brief } = await db
        .from("brand_briefs")
        .select("id")
        .eq("client_user_id", project.user_id)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await db
        .from("brand_identity_deliveries")
        .insert({
          user_id: project.user_id,
          project_id: project.id,
          brief_id: brief?.id || null,
          title,
          description,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message || "Could not create the brand identity delivery.");
      delivery = data;
    } else {
      const { data, error } = await db
        .from("brand_identity_deliveries")
        .update({ title, description, updated_at: new Date().toISOString() })
        .eq("id", delivery.id)
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message || "Could not update the brand identity delivery.");
      delivery = data;
    }

    const { count } = await db
      .from("brand_identity_delivery_files")
      .select("id", { count: "exact", head: true })
      .eq("delivery_id", delivery.id);
    let position = Number(count || 0);

    for (const file of files) {
      const safe = await assertSafeUpload(file, {
        allow: ["image", "pdf", "office", "zip"],
        maxBytes: 50 * 1024 * 1024,
      });
      const storagePath = `${project.user_id}/${delivery.id}/${crypto.randomUUID()}-${safeFileBase(file.name)}.${safe.ext}`;
      const { error: uploadError } = await db.storage
        .from(BRAND_IDENTITY_BUCKET)
        .upload(storagePath, safe.buffer, { contentType: safe.contentType, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      const { error: fileError } = await db
        .from("brand_identity_delivery_files")
        .insert({
          delivery_id: delivery.id,
          file_name: file.name.slice(0, 180),
          storage_path: storagePath,
          mime_type: safe.contentType,
          file_size: safe.buffer.length,
          file_kind: safe.kind === "zip" ? "archive" : safe.kind,
          position,
        });
      if (fileError) {
        await db.storage.from(BRAND_IDENTITY_BUCKET).remove([storagePath]);
        throw new Error(fileError.message);
      }
      position += 1;
    }

    delivery = await loadDelivery(db, id);
    return NextResponse.json(await responsePayload(db, project, delivery));
  } catch (error) {
    const status = error instanceof UploadSecurityError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Brand identity upload failed." }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "deliveries.approve");
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = financeDb();

  try {
    const project = await loadProject(db, id);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const delivery = await loadDelivery(db, id);
    if (!delivery) return NextResponse.json({ error: "Upload the completed brand files first." }, { status: 404 });

    const publish = body.is_public === true;
    if (publish) {
      const { count } = await db
        .from("brand_identity_delivery_files")
        .select("id", { count: "exact", head: true })
        .eq("delivery_id", delivery.id);
      if (!count) return NextResponse.json({ error: "Upload at least one completed brand file before publishing." }, { status: 409 });
      if (project.status !== "completed" && body.mark_project_completed !== true) {
        return NextResponse.json({ error: "Mark the project completed before publishing this identity." }, { status: 409 });
      }
      if (project.status !== "completed") {
        const now = new Date().toISOString();
        const { error } = await db
          .from("finance_projects")
          .update({ status: "completed", completion_date: now.slice(0, 10), updated_at: now })
          .eq("id", project.id);
        if (error) throw new Error(error.message);
        project.status = "completed";
      }
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if ("title" in body) patch.title = cleanText(body.title, 180) || delivery.title;
    if ("description" in body) patch.description = cleanText(body.description, 4000) || null;
    if (typeof body.is_public === "boolean") {
      patch.is_public = body.is_public;
      patch.published_at = body.is_public ? delivery.published_at || new Date().toISOString() : null;
    }

    const { data, error } = await db
      .from("brand_identity_deliveries")
      .update(patch)
      .eq("id", delivery.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message || "Could not publish the brand identity.");
    if (publish && !delivery.is_public && project.user_id) {
      const { error: notificationError } = await db.from("notifications").insert({
        user_id: project.user_id,
        type: "brand_identity",
        title: "New brand identity",
        message: `${data.title} is now available in your account.`,
        link: "/dashboard/brand-identity",
      });
      if (notificationError) console.error("[brand-identity] client notification failed", notificationError.message);
    }
    return NextResponse.json(await responsePayload(db, project, data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the brand identity delivery." }, { status: 500 });
  }
}
