/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import { hashDocPassword } from "@/lib/protect-docs";
import { logActivity } from "@/lib/activity-log";
import { VAULT_KINDS } from "@/lib/executive-board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BUCKET = "executive-board";
const MAX_BYTES = 50 * 1024 * 1024;

function str(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuid(value: unknown) {
  const candidate = str(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : "";
}

function safeName(name: string) {
  return (name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

/** Only http and https links are stored, and never a private network address. */
function externalLink(value: unknown) {
  const input = str(value, 2000);
  if (!input) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

const SOURCE_KINDS = ["cdoc", "protected_doc", "legal_doc", "link"] as const;

/** Where a referenced document actually lives, and what to call it. */
async function resolveSource(sourceKind: string, sourceId: string) {
  if (sourceKind === "cdoc") {
    const row = await glashMaybeOne<any>(`select id, title, slug from public.team_cdocs where id=$1 and is_archived is not true`, [sourceId]);
    return row ? { title: row.title, name: `${row.title}.cdoc`, mime: "text/html", url: `/team/cdocs/${row.id}` } : null;
  }
  if (sourceKind === "protected_doc") {
    const row = await glashMaybeOne<any>(`select id, title, file_url, file_mime, file_size_bytes from public.team_protected_documents where id=$1`, [sourceId]);
    return row ? { title: row.title, name: row.title, mime: row.file_mime || null, url: row.file_url || `/team/protect-docs`, size: Number(row.file_size_bytes) || 0 } : null;
  }
  if (sourceKind === "legal_doc") {
    const row = await glashMaybeOne<any>(`select id, title, slug from public.legal_documents where id::text=$1`, [sourceId]);
    return row ? { title: row.title, name: row.title, mime: "text/html", url: `/legal/${row.slug}` } : null;
  }
  return null;
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");
}

/** Walks up the folder tree looking for the nearest password. */
async function folderChainHasPassword(folderId: string | null): Promise<boolean> {
  let current = folderId;
  // Depth guard: a corrupted parent cycle must not spin forever.
  for (let depth = 0; current && depth < 12; depth++) {
    const row = await glashMaybeOne<any>(
      `select parent_id, password_hash from public.executive_vault_folders where id=$1`,
      [current],
    );
    if (!row) return false;
    if (row.password_hash) return true;
    current = row.parent_id;
  }
  return false;
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  /* ---------------- File upload (multipart) ---------------- */
  if (contentType.includes("multipart/form-data")) {
    const { session, denied } = await requireAdmin(req, "executive_board.vault_manage");
    if (denied || !session) return denied || NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    const title = str(form.get("title"), 200);
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "Attach a file to upload." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Files are limited to 50MB." }, { status: 413 });
    }

    let safe: Awaited<ReturnType<typeof assertSafeUpload>>;
    try {
      safe = await assertSafeUpload(file, { allow: ["image", "pdf", "office", "zip", "design"], maxBytes: MAX_BYTES });
    } catch (error) {
      if (error instanceof UploadSecurityError) {
        return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      }
      throw error;
    }

    const storage = (getSupabaseAdmin() as any).storage;
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName(file.name.replace(/\.[^.]+$/, ""))}.${safe.ext}`;
    const { error: uploadError } = await storage.from(BUCKET).upload(path, safe.buffer, {
      contentType: safe.contentType,
      upsert: false,
    });
    if (uploadError) return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });

    const password = str(form.get("password"), 200);
    const kind = str(form.get("kind"), 40);
    const row = await glashMaybeOne<any>(
      `insert into public.executive_vault_files
         (folder_id,title,description,kind,storage_path,file_name,file_mime,file_size_bytes,password_hash,created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [
        uuid(form.get("folder_id")) || null,
        title || file.name,
        str(form.get("description"), 2000) || null,
        (VAULT_KINDS as readonly string[]).includes(kind) ? kind : "attachment",
        path,
        file.name.slice(0, 200),
        safe.contentType,
        safe.buffer.byteLength,
        password ? await hashDocPassword(password) : null,
        session.email,
      ],
    );

    await logActivity({
      action: "executive_board.vault.upload",
      page: "executive-board/vault",
      resource_type: "executive_vault_file",
      resource_id: row?.id,
      resource_label: title || file.name,
      metadata: { protected: !!password, size: safe.buffer.byteLength },
    });
    return NextResponse.json({ ok: true, id: row?.id }, { status: 201 });
  }

  /* ---------------- JSON actions ---------------- */
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = str(body.action, 60);
  const { session, denied } = await requireAdmin(req, "executive_board.vault_manage");
  if (denied || !session) return denied || NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const actor = session.email;

  try {
    if (action === "attach_document") {
      const sourceKind = str(body.source_kind, 20);
      if (!(SOURCE_KINDS as readonly string[]).includes(sourceKind)) {
        return NextResponse.json({ ok: false, error: "Choose a document or a link to attach." }, { status: 400 });
      }
      const kind = str(body.kind, 40);
      const password = str(body.password, 200);
      const folderId = uuid(body.folder_id) || null;

      let title = str(body.title, 200);
      let sourceId: string | null = null;
      let linkUrl: string | null = null;
      let fileName: string | null = null;
      let fileMime: string | null = null;
      let fileSize = 0;

      if (sourceKind === "link") {
        linkUrl = externalLink(body.link_url);
        if (!linkUrl) return NextResponse.json({ ok: false, error: "Enter a valid public http or https link." }, { status: 400 });
        title = title || new URL(linkUrl).hostname;
        fileName = title;
      } else {
        sourceId = uuid(body.source_id);
        if (!sourceId) return NextResponse.json({ ok: false, error: "Choose a document to attach." }, { status: 400 });
        const resolved = await resolveSource(sourceKind, sourceId);
        if (!resolved) return NextResponse.json({ ok: false, error: "That document could not be found." }, { status: 404 });
        title = title || resolved.title;
        fileName = resolved.name;
        fileMime = resolved.mime;
        fileSize = (resolved as any).size || 0;
      }

      const row = await glashMaybeOne<any>(
        `insert into public.executive_vault_files
           (folder_id,title,description,kind,source_kind,source_id,link_url,storage_path,file_name,file_mime,file_size_bytes,password_hash,created_by)
         values ($1,$2,$3,$4,$5,$6,$7,null,$8,$9,$10,$11,$12) returning id`,
        [
          folderId,
          title,
          str(body.description, 2000) || null,
          (VAULT_KINDS as readonly string[]).includes(kind) ? kind : "attachment",
          sourceKind,
          sourceId,
          linkUrl,
          fileName,
          fileMime,
          fileSize,
          password ? await hashDocPassword(password) : null,
          actor,
        ],
      );

      await logActivity({
        action: "executive_board.vault.attach",
        page: "executive-board/vault",
        resource_type: "executive_vault_file",
        resource_id: row?.id,
        resource_label: title,
        metadata: { source_kind: sourceKind, protected: !!password },
      });
      return NextResponse.json({ ok: true, id: row?.id }, { status: 201 });
    }

    if (action === "save_folder") {
      const id = uuid(body.id);
      const name = str(body.name, 160);
      if (!name) return NextResponse.json({ ok: false, error: "A folder needs a name." }, { status: 400 });
      const parentId = uuid(body.parent_id) || null;
      if (id && parentId === id) {
        return NextResponse.json({ ok: false, error: "A folder cannot sit inside itself." }, { status: 400 });
      }
      const description = str(body.description, 2000) || null;
      // `password` sets or replaces; `clear_password` removes it. Leaving both
      // out keeps whatever the folder already had.
      const password = str(body.password, 200);
      const clear = body.clear_password === true;

      if (id) {
        const passwordSql = clear ? "null" : password ? "$4" : "password_hash";
        const params: any[] = [name, description, parentId];
        if (!clear && password) params.push(await hashDocPassword(password));
        const row = await glashMaybeOne<any>(
          `update public.executive_vault_folders
              set name=$1, description=$2, parent_id=$3, password_hash=${passwordSql}, updated_at=now()
            where id=$${params.length + 1} returning id`,
          [...params, id],
        );
        await logActivity({
          action: "executive_board.vault.folder_update",
          page: "executive-board/vault",
          resource_type: "executive_vault_folder",
          resource_id: id,
          resource_label: name,
        });
        return NextResponse.json({ ok: true, id: row?.id });
      }

      const row = await glashMaybeOne<any>(
        `insert into public.executive_vault_folders (parent_id,name,description,password_hash,created_by)
         values ($1,$2,$3,$4,$5) returning id`,
        [parentId, name, description, password ? await hashDocPassword(password) : null, actor],
      );
      await logActivity({
        action: "executive_board.vault.folder_create",
        page: "executive-board/vault",
        resource_type: "executive_vault_folder",
        resource_id: row?.id,
        resource_label: name,
      });
      return NextResponse.json({ ok: true, id: row?.id }, { status: 201 });
    }

    if (action === "delete_folder") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Folder is invalid." }, { status: 400 });
      const contents = await glashMaybeOne<any>(
        `select
           (select count(*) from public.executive_vault_files where folder_id=$1) as files,
           (select count(*) from public.executive_vault_folders where parent_id=$1) as folders`,
        [id],
      );
      // Deleting a folder cascades to its subfolders, so refuse while anything
      // is still inside rather than silently taking documents with it.
      if (Number(contents?.files || 0) > 0 || Number(contents?.folders || 0) > 0) {
        return NextResponse.json(
          { ok: false, error: "Empty this folder before deleting it." },
          { status: 409 },
        );
      }
      await glashQuery(`delete from public.executive_vault_folders where id=$1`, [id]);
      await logActivity({
        action: "executive_board.vault.folder_delete",
        page: "executive-board/vault",
        resource_type: "executive_vault_folder",
        resource_id: id,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "update_file") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "File is invalid." }, { status: 400 });
      const title = str(body.title, 200);
      if (!title) return NextResponse.json({ ok: false, error: "A file needs a title." }, { status: 400 });
      const kind = str(body.kind, 40);
      const password = str(body.password, 200);
      const clear = body.clear_password === true;
      const passwordSql = clear ? "null" : password ? "$5" : "password_hash";
      const params: any[] = [
        title,
        str(body.description, 2000) || null,
        (VAULT_KINDS as readonly string[]).includes(kind) ? kind : "attachment",
        uuid(body.folder_id) || null,
      ];
      if (!clear && password) params.push(await hashDocPassword(password));
      await glashQuery(
        `update public.executive_vault_files
            set title=$1, description=$2, kind=$3, folder_id=$4, password_hash=${passwordSql}, updated_at=now()
          where id=$${params.length + 1}`,
        [...params, id],
      );
      await logActivity({
        action: "executive_board.vault.file_update",
        page: "executive-board/vault",
        resource_type: "executive_vault_file",
        resource_id: id,
        resource_label: title,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_file") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "File is invalid." }, { status: 400 });
      const file = await glashMaybeOne<any>(`select storage_path, title from public.executive_vault_files where id=$1`, [id]);
      if (file?.storage_path) {
        const storage = (getSupabaseAdmin() as any).storage;
        // Best effort: a stranded object is better than a row we cannot delete.
        await storage.from(BUCKET).remove([file.storage_path]).catch(() => undefined);
      }
      await glashQuery(`delete from public.executive_vault_files where id=$1`, [id]);
      await logActivity({
        action: "executive_board.vault.file_delete",
        page: "executive-board/vault",
        resource_type: "executive_vault_file",
        resource_id: id,
        resource_label: file?.title || id,
      });
      return NextResponse.json({ ok: true });
    }

    /* ---------------- Share links ---------------- */
    if (action === "create_share") {
      const fileId = uuid(body.file_id);
      const folderId = uuid(body.folder_id);
      if (!fileId === !folderId) {
        return NextResponse.json({ ok: false, error: "Share either one file or one folder." }, { status: 400 });
      }
      const password = str(body.password, 200);
      // A share must be gated by something: its own password, the item's, or
      // the folder it lives in. Otherwise the link alone hands the file over.
      let gated = !!password;
      if (!gated && fileId) {
        const file = await glashMaybeOne<any>(
          `select folder_id, password_hash from public.executive_vault_files where id=$1`,
          [fileId],
        );
        if (!file) return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
        gated = !!file.password_hash || (await folderChainHasPassword(file.folder_id));
      }
      if (!gated && folderId) {
        gated = await folderChainHasPassword(folderId);
      }
      if (!gated && body.allow_unprotected !== true) {
        return NextResponse.json(
          { ok: false, error: "This item has no password. Set one on the share, or on the item, before sending it." },
          { status: 400 },
        );
      }

      const expiresDays = Math.max(0, Math.min(365, Math.round(Number(body.expires_in_days) || 0)));
      const maxDownloads = Math.max(0, Math.min(1000, Math.round(Number(body.max_downloads) || 0)));
      const row = await glashMaybeOne<any>(
        `insert into public.executive_vault_shares
           (file_id,folder_id,password_hash,recipient_email,note,expires_at,max_downloads,created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning token`,
        [
          fileId || null,
          folderId || null,
          password ? await hashDocPassword(password) : null,
          str(body.recipient_email, 320).toLowerCase() || null,
          str(body.note, 600) || null,
          expiresDays ? new Date(Date.now() + expiresDays * 86_400_000).toISOString() : null,
          maxDownloads || null,
          actor,
        ],
      );
      await logActivity({
        action: "executive_board.vault.share",
        page: "executive-board/vault",
        resource_type: fileId ? "executive_vault_file" : "executive_vault_folder",
        resource_id: fileId || folderId,
        metadata: { expires_in_days: expiresDays || null, max_downloads: maxDownloads || null },
      });
      return NextResponse.json({ ok: true, token: row?.token, url: `${siteUrl()}/vault/${row?.token}` }, { status: 201 });
    }

    if (action === "revoke_share") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Share is invalid." }, { status: 400 });
      await glashQuery(
        `update public.executive_vault_shares set revoked_at=now() where id=$1 and revoked_at is null`,
        [id],
      );
      await logActivity({
        action: "executive_board.vault.share_revoke",
        page: "executive-board/vault",
        resource_type: "executive_vault_share",
        resource_id: id,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Vault request failed." },
      { status: 500 },
    );
  }
}

/* ---------------- Internal download (admins) ---------------- */
export async function GET(req: NextRequest) {
  const { denied } = await requireAdmin(req, "executive_board.vault_view");
  if (denied) return denied;
  const params = new URL(req.url).searchParams;

  // The picker: everything already in the system that can be attached.
  if (str(params.get("resource"), 40) === "attachable") {
    const search = str(params.get("q"), 120);
    const like = `%${search}%`;
    const [cdocs, protectedDocs, legalDocs] = await Promise.all([
      glashQuery<any>(
        `select id, title, department, updated_at from public.team_cdocs
         where is_archived is not true ${search ? "and title ilike $1" : ""}
         order by updated_at desc nulls last limit 60`,
        search ? [like] : [],
      ),
      glashQuery<any>(
        `select id, title, description, file_mime, file_size_bytes, created_at from public.team_protected_documents
         ${search ? "where title ilike $1" : ""}
         order by created_at desc limit 60`,
        search ? [like] : [],
      ),
      glashQuery<any>(
        `select id, title, slug, updated_at from public.legal_documents
         ${search ? "where title ilike $1" : ""}
         order by updated_at desc nulls last limit 60`,
        search ? [like] : [],
      ),
    ]);
    return NextResponse.json({ ok: true, cdocs, protectedDocs, legalDocs });
  }

  const id = uuid(params.get("file"));
  if (!id) return NextResponse.json({ ok: false, error: "File is invalid." }, { status: 400 });

  const file = await glashMaybeOne<any>(
    `select storage_path, file_name, file_mime, source_kind, source_id, link_url from public.executive_vault_files where id=$1`,
    [id],
  );
  if (!file) return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });

  // An attached entry is a reference, not a copy, so opening it sends the reader
  // to where the document actually lives rather than serving stale bytes.
  if (file.source_kind && file.source_kind !== "upload") {
    if (file.source_kind === "link" && file.link_url) return NextResponse.redirect(file.link_url);
    const resolved = file.source_id ? await resolveSource(file.source_kind, file.source_id) : null;
    if (!resolved) return NextResponse.json({ ok: false, error: "The attached document is no longer available." }, { status: 404 });
    return NextResponse.redirect(resolved.url.startsWith("http") ? resolved.url : `${siteUrl()}${resolved.url}`);
  }

  const storage = (getSupabaseAdmin() as any).storage;
  const { data, error } = await storage.from(BUCKET).download(file.storage_path);
  if (error || !data) return NextResponse.json({ ok: false, error: "File could not be read." }, { status: 500 });

  return new NextResponse(new Uint8Array(await (data as Blob).arrayBuffer()), {
    headers: {
      "Content-Type": file.file_mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName(file.file_name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
