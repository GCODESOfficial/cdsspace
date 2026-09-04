/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyDocPassword } from "@/lib/protect-docs";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";
import { formatBytes } from "@/lib/executive-board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "executive-board";

// Deliberately vague: a share link that is revoked, expired, spent, or simply
// wrong all look the same from outside.
const GONE = "This link is no longer available.";

function safeName(name: string) {
  return (name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function uuidish(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

async function loadShare(token: string) {
  if (!uuidish(token)) return null;
  const share = await glashMaybeOne<any>(
    `select * from public.executive_vault_shares where token=$1`,
    [token],
  );
  if (!share) return null;
  if (share.revoked_at) return null;
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) return null;
  if (share.max_downloads != null && share.download_count >= share.max_downloads) return null;
  return share;
}

/** The nearest password up the folder tree, if any. */
async function inheritedFolderHash(folderId: string | null): Promise<string | null> {
  let current = folderId;
  for (let depth = 0; current && depth < 12; depth++) {
    const row = await glashMaybeOne<any>(
      `select parent_id, password_hash from public.executive_vault_folders where id=$1`,
      [current],
    );
    if (!row) return null;
    if (row.password_hash) return row.password_hash;
    current = row.parent_id;
  }
  return null;
}

/**
 * Which hash guards this share: the share's own, then the file's, then the
 * closest protected folder above it. Null means the item is open.
 */
async function guardingHash(share: any): Promise<string | null> {
  if (share.password_hash) return share.password_hash;
  if (share.file_id) {
    const file = await glashMaybeOne<any>(
      `select folder_id, password_hash from public.executive_vault_files where id=$1`,
      [share.file_id],
    );
    if (!file) return null;
    return file.password_hash || (await inheritedFolderHash(file.folder_id));
  }
  return inheritedFolderHash(share.folder_id);
}

/** What the recipient may see before entering a password. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await loadShare(token);
  if (!share) return NextResponse.json({ ok: false, error: GONE }, { status: 404 });

  const needsPassword = !!(await guardingHash(share));

  if (share.file_id) {
    const file = await glashMaybeOne<any>(
      `select title, file_name, file_size_bytes, kind from public.executive_vault_files where id=$1`,
      [share.file_id],
    );
    if (!file) return NextResponse.json({ ok: false, error: GONE }, { status: 404 });
    return NextResponse.json({
      ok: true,
      kind: "file",
      needs_password: needsPassword,
      note: share.note,
      expires_at: share.expires_at,
      item: { title: file.title, file_name: file.file_name, size: formatBytes(file.file_size_bytes) },
    });
  }

  const folder = await glashMaybeOne<any>(
    `select name, description from public.executive_vault_folders where id=$1`,
    [share.folder_id],
  );
  if (!folder) return NextResponse.json({ ok: false, error: GONE }, { status: 404 });
  const count = await glashMaybeOne<any>(
    `select count(*)::int as files from public.executive_vault_files where folder_id=$1`,
    [share.folder_id],
  );
  return NextResponse.json({
    ok: true,
    kind: "folder",
    needs_password: needsPassword,
    note: share.note,
    expires_at: share.expires_at,
    item: { title: folder.name, description: folder.description, file_count: Number(count?.files || 0) },
  });
}

/**
 * Unlock, then either list a shared folder or stream a shared file.
 * `download` picks the file to stream; for a file share it is implied.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const password = typeof body.password === "string" ? body.password : "";

  // Rate limit on the link and the caller so a share password cannot be
  // brute-forced from one machine or across many tokens.
  const limit = checkIntelligenceRateLimit(`vault-share:${token}:${clientIp(req)}`, 10, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const share = await loadShare(token);
  if (!share) return NextResponse.json({ ok: false, error: GONE }, { status: 404 });

  const hash = await guardingHash(share);
  if (hash && !(await verifyDocPassword(password, hash))) {
    return NextResponse.json({ ok: false, error: "That password is not correct." }, { status: 401 });
  }

  await glashQuery(
    `update public.executive_vault_shares set last_opened_at=now() where id=$1`,
    [share.id],
  );

  // Folder share, no file picked yet: hand back the listing.
  const requested = typeof body.download === "string" ? body.download : "";
  if (share.folder_id && !requested) {
    const files = await glashQuery<any>(
      `select id, title, file_name, file_size_bytes, kind
         from public.executive_vault_files where folder_id=$1 order by created_at desc limit 200`,
      [share.folder_id],
    );
    return NextResponse.json({
      ok: true,
      files: files.map((file) => ({
        id: file.id,
        title: file.title,
        file_name: file.file_name,
        size: formatBytes(file.file_size_bytes),
        kind: file.kind,
      })),
    });
  }

  const fileId = share.file_id || requested;
  if (!uuidish(String(fileId))) return NextResponse.json({ ok: false, error: GONE }, { status: 404 });

  const file = await glashMaybeOne<any>(
    `select id, folder_id, storage_path, file_name, file_mime, password_hash, source_kind, link_url
       from public.executive_vault_files where id=$1`,
    [fileId],
  );
  if (!file) return NextResponse.json({ ok: false, error: GONE }, { status: 404 });
  // A folder share must not become a key to files outside that folder.
  if (share.folder_id && file.folder_id !== share.folder_id) {
    return NextResponse.json({ ok: false, error: GONE }, { status: 404 });
  }
  // A file inside a shared folder may set its own, stricter password.
  if (share.folder_id && file.password_hash && !(await verifyDocPassword(password, file.password_hash))) {
    return NextResponse.json({ ok: false, error: "That file has its own password." }, { status: 401 });
  }

  // An entry that only references a document elsewhere has no bytes to send.
  // An external link is handed on; an internal document is not, because the
  // recipient of a share link has no account here and a redirect would only
  // expose an internal address they cannot open.
  if (file.source_kind && file.source_kind !== "upload") {
    if (file.source_kind === "link" && file.link_url) {
      await glashQuery(`update public.executive_vault_shares set download_count=download_count+1 where id=$1`, [share.id]);
      return NextResponse.redirect(file.link_url);
    }
    return NextResponse.json({
      ok: false,
      error: "This item is a reference to a document held inside CDS Space and cannot be opened from a share link. Ask the sender for the document itself.",
    }, { status: 409 });
  }

  const storage = (getSupabaseAdmin() as any).storage;
  const { data, error } = await storage.from(BUCKET).download(file.storage_path);
  if (error || !data) return NextResponse.json({ ok: false, error: "File could not be read." }, { status: 500 });

  await glashQuery(
    `update public.executive_vault_shares set download_count=download_count+1 where id=$1`,
    [share.id],
  );

  return new NextResponse(new Uint8Array(await (data as Blob).arrayBuffer()), {
    headers: {
      "Content-Type": file.file_mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName(file.file_name)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
