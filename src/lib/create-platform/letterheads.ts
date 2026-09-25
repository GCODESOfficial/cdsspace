import "server-only";

import { createHash } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import type { CreateActor } from "@/lib/create-platform/session";

export const LETTERHEAD_BUCKET = "create-private-assets";
/** Letterhead designs and signatures: 5MB each, checked in the browser and again here. */
export const LETTERHEAD_MAX_BYTES = 5 * 1024 * 1024;

/** Opaque storage prefix for one server-verified CREATE workspace. */
export function createPrivateAssetPrefix(actor: Pick<CreateActor, "kind" | "id">) {
  return createHash("sha256").update(`${actor.kind}:${actor.id}`).digest("hex").slice(0, 32);
}

export function isCreatePrivateAssetPath(actor: Pick<CreateActor, "kind" | "id">, path: unknown) {
  return typeof path === "string" && path.startsWith(`${createPrivateAssetPrefix(actor)}/`);
}

export type LetterheadRecord = {
  id: string;
  scope: LetterheadScope;
  title: string;
  bodyHtml: string;
  paperSize: "a4" | "legal";
  bottomMargin: "wide" | "small";
  hasSecondPage: boolean;
  firstPagePath: string | null;
  firstPageName: string | null;
  firstPageUrl: string | null;
  secondPagePath: string | null;
  secondPageName: string | null;
  secondPageUrl: string | null;
  signaturePath: string | null;
  signatureName: string | null;
  signatureUrl: string | null;
  signatureX: number;
  signatureY: number;
  signatureWidth: number;
  signaturePage: "first" | "last";
  stampPath: string | null;
  stampName: string | null;
  stampUrl: string | null;
  stampX: number;
  stampY: number;
  stampWidth: number;
  stampPage: "first" | "last";
  signatures: LetterheadSignatureRecord[];
  status: "draft" | "ready" | "archived";
  deliveredByCds: boolean;
  deliveredAt: string | null;
  lastExportedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LetterheadSignatureRecord = {
  id: string;
  source: "upload" | "invitation";
  signerName: string | null;
  signerEmail: string | null;
  status: "ready" | "pending" | "opened" | "signed" | "declined";
  signatureUrl: string | null;
  signatureX: number;
  signatureY: number;
  signatureWidth: number;
  signaturePage: "first" | "last";
  shareUrl: string | null;
  signedAt: string | null;
};

export function sanitizeLetterheadBody(value: unknown) {
  return sanitizeHtml(typeof value === "string" ? value.slice(0, 250_000) : "", {
    allowedTags: ["h1", "h2", "h3", "p", "div", "br", "hr", "ul", "ol", "li", "strong", "b", "em", "i", "u", "span", "font", "a", "img", "figure", "figcaption", "blockquote", "pre"],
    allowedAttributes: {
      "*": ["style", "align", "data-align"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height", "data-align"],
      font: ["color", "size"],
    },
    allowedSchemes: ["http", "https", "data", "mailto"],
    allowedSchemesByTag: { img: ["https", "data"] },
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i],
        "font-size": [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i],
        "font-weight": [/^(?:normal|bold|[1-9]00)$/i],
        "font-style": [/^(?:normal|italic)$/i],
        "text-align": [/^(?:left|center|right|justify)$/i],
        "text-decoration": [/^(?:none|underline)$/i],
        display: [/^(?:block|inline|inline-block)$/i],
        float: [/^(?:none|left|right)$/i],
        width: [/^\d+(?:\.\d+)?(?:px|%)$/i],
        height: [/^\d+(?:\.\d+)?(?:px|%)$/i],
        "max-width": [/^\d+(?:\.\d+)?(?:px|%)$/i],
        "margin-left": [/^(?:auto|\d+(?:\.\d+)?px)$/i],
        "margin-right": [/^(?:auto|\d+(?:\.\d+)?px)$/i],
      },
    },
  });
}

export const EXECUTIVE_BOARD_IDENTITY = {
  companyShort: "CDS Space",
  companyFull: "CDS Space Branding Agency LTD",
  senderName: "Chris O. John",
} as const;

/**
 * Official Executive Board correspondence must never retain generic sender
 * placeholders. The full legal-style company name replaces formal company
 * placeholders; writers can still use the established short name, CDS Space,
 * naturally elsewhere in the document.
 */
export function applyExecutiveBoardIdentity(value: unknown) {
  return (typeof value === "string" ? value : "")
    .replace(/\[\s*your(?:\s|&nbsp;)+company(?:\s|&nbsp;)+name\s*\]/gi, EXECUTIVE_BOARD_IDENTITY.companyFull)
    .replace(/\byour(?:\s|&nbsp;)+company(?:\s|&nbsp;)+name\b/gi, EXECUTIVE_BOARD_IDENTITY.companyFull)
    .replace(/\[\s*company(?:\s|&nbsp;)+name\s*\]/gi, EXECUTIVE_BOARD_IDENTITY.companyFull)
    .replace(/\[\s*your(?:\s|&nbsp;)+name\s*\]/gi, EXECUTIVE_BOARD_IDENTITY.senderName)
    .replace(/\byour(?:\s|&nbsp;)+name\b/gi, EXECUTIVE_BOARD_IDENTITY.senderName)
    .replace(/\[\s*sender(?:\s|&nbsp;)+name\s*\]/gi, EXECUTIVE_BOARD_IDENTITY.senderName);
}

function title(value: unknown) {
  return (typeof value === "string" ? value.trim() : "").slice(0, 160) || "Untitled letter";
}

function numberInRange(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/**
 * The owner-checked app route that streams this image.
 *
 * Signed storage URLs cannot be used: GlashDB's sign endpoint returns
 * { Key, Id } instead of { signedURL }, so the storage client produced
 * ".../storage/v1undefined" and every preview was a broken image. The path is
 * appended as a version so a re-upload is never served from a stale cache.
 */
type LetterheadAssetKind = "firstPage" | "secondPage" | "signature" | "stamp";

function assetUrl(actor: CreateActor, id: unknown, kind: LetterheadAssetKind, path: unknown) {
  if (typeof path !== "string" || !path) return null;
  const version = path.split("/").pop() || "";
  return `/api/create/letterheads/${encodeURIComponent(String(id))}/asset/${kind}?workspace=${actor.kind}&v=${encodeURIComponent(version)}`;
}

function additionalSignatureUrl(actor: CreateActor, letterheadId: unknown, signatureId: unknown, path: unknown) {
  if (typeof path !== "string" || !path) return null;
  const version = path.split("/").pop() || "";
  return `/api/create/letterheads/${encodeURIComponent(String(letterheadId))}/signatures/${encodeURIComponent(String(signatureId))}/asset?workspace=${actor.kind}&v=${encodeURIComponent(version)}`;
}

async function listLetterheadSignatures(actor: CreateActor, letterheadId: string): Promise<LetterheadSignatureRecord[]> {
  const rows = await glashQuery<Record<string, unknown>>(
    `select signature.id, signature.source, signature.signer_name, signature.signer_email,
            signature.access_token, signature.status, signature.storage_path,
            signature.signature_x, signature.signature_y, signature.signature_width,
            signature.signature_page, signature.signed_at
       from public.create_letterhead_signatures signature
       join public.create_letterheads letterhead on letterhead.id = signature.letterhead_id
      where signature.letterhead_id = $3::uuid
        and letterhead.owner_kind = $1 and letterhead.owner_id = $2 and letterhead.deleted_at is null
      order by signature.created_at, signature.id`,
    [actor.kind, actor.id, letterheadId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    source: row.source === "invitation" ? "invitation" : "upload",
    signerName: typeof row.signer_name === "string" ? row.signer_name : null,
    signerEmail: typeof row.signer_email === "string" ? row.signer_email : null,
    status: row.status === "pending" || row.status === "opened" || row.status === "signed" || row.status === "declined" ? row.status : "ready",
    signatureUrl: additionalSignatureUrl(actor, letterheadId, row.id, row.storage_path),
    signatureX: Number(row.signature_x || 54),
    signatureY: Number(row.signature_y || 72),
    signatureWidth: Number(row.signature_width || 22),
    signaturePage: row.signature_page === "first" ? "first" : "last",
    shareUrl: row.source === "invitation" && row.access_token ? `/letterhead-sign/${String(row.access_token)}` : null,
    signedAt: row.signed_at ? String(row.signed_at) : null,
  }));
}

async function fromRow(actor: CreateActor, row: Record<string, unknown>): Promise<LetterheadRecord> {
  const scope = letterheadScope(row.scope);
  const bodyHtml = String(row.body_html || "");
  const documentTitle = String(row.title || "Untitled letter");
  const firstPageUrl = assetUrl(actor, row.id, "firstPage", row.first_page_path);
  const secondPageUrl = assetUrl(actor, row.id, "secondPage", row.second_page_path);
  const signatureUrl = assetUrl(actor, row.id, "signature", row.signature_path);
  const stampUrl = assetUrl(actor, row.id, "stamp", row.stamp_path);
  const signatures = await listLetterheadSignatures(actor, String(row.id));
  return {
    id: String(row.id),
    scope,
    title: scope === "executive_board" ? applyExecutiveBoardIdentity(documentTitle) : documentTitle,
    bodyHtml: scope === "executive_board" ? applyExecutiveBoardIdentity(bodyHtml) : bodyHtml,
    paperSize: row.paper_size === "legal" ? "legal" : "a4",
    bottomMargin: row.bottom_margin === "small" ? "small" : "wide",
    hasSecondPage: Boolean(row.has_second_page),
    firstPagePath: typeof row.first_page_path === "string" ? row.first_page_path : null,
    firstPageName: typeof row.first_page_name === "string" ? row.first_page_name : null,
    firstPageUrl,
    secondPagePath: typeof row.second_page_path === "string" ? row.second_page_path : null,
    secondPageName: typeof row.second_page_name === "string" ? row.second_page_name : null,
    secondPageUrl,
    signaturePath: typeof row.signature_path === "string" ? row.signature_path : null,
    signatureName: typeof row.signature_name === "string" ? row.signature_name : null,
    signatureUrl,
    signatureX: Number(row.signature_x || 62),
    signatureY: Number(row.signature_y || 74),
    signatureWidth: Number(row.signature_width || 24),
    signaturePage: row.signature_page === "first" ? "first" : "last",
    stampPath: typeof row.stamp_path === "string" ? row.stamp_path : null,
    stampName: typeof row.stamp_name === "string" ? row.stamp_name : null,
    stampUrl,
    stampX: Number(row.stamp_x || 62),
    stampY: Number(row.stamp_y || 68),
    stampWidth: Number(row.stamp_width || 20),
    stampPage: row.stamp_page === "first" ? "first" : "last",
    signatures,
    status: row.status === "ready" || row.status === "archived" ? row.status : "draft",
    deliveredByCds: Boolean(row.delivered_by_cds),
    deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
    lastExportedAt: row.last_exported_at ? String(row.last_exported_at) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

const RETURNING = `id, scope, title, body_html, paper_size, bottom_margin, has_second_page,
  first_page_path, first_page_name, first_page_size_bytes, second_page_path, second_page_name, second_page_size_bytes,
  signature_path, signature_name, signature_size_bytes, signature_x, signature_y, signature_width,
  signature_page, stamp_path, stamp_name, stamp_size_bytes, stamp_x, stamp_y, stamp_width, stamp_page,
  status, delivered_by_cds, delivered_from_letterhead_id,
  delivered_by_admin, delivered_at, last_exported_at, created_at, updated_at`;

/**
 * Which studio a document belongs to. Executive Board letters are company
 * correspondence on the one CDS Space letterhead, so they are kept apart from
 * the per-workspace documents of the CREATE tool.
 */
export type LetterheadScope = "create" | "executive_board";

export function letterheadScope(value: unknown): LetterheadScope {
  return value === "executive_board" ? "executive_board" : "create";
}

export async function listLetterheads(actor: CreateActor, scope: LetterheadScope = "create") {
  const rows = await glashQuery<Record<string, unknown>>(
    `select ${RETURNING} from public.create_letterheads
      where owner_kind = $1 and owner_id = $2 and scope = $3 and deleted_at is null and status <> 'archived'
      order by updated_at desc limit 60`,
    [actor.kind, actor.id, scope],
  );
  return Promise.all(rows.map((row) => fromRow(actor, row)));
}

export async function getLetterhead(actor: CreateActor, id: string) {
  const row = await glashMaybeOne<Record<string, unknown>>(
    `select ${RETURNING} from public.create_letterheads
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null`,
    [actor.kind, actor.id, id],
  );
  return row ? fromRow(actor, row) : null;
}

export async function createLetterhead(actor: CreateActor, scope: LetterheadScope = "create") {
  const row = await glashMaybeOne<Record<string, unknown>>(
    `insert into public.create_letterheads (owner_kind, owner_id, actor_email, scope)
     values ($1, $2, $3, $4) returning ${RETURNING}`,
    [actor.kind, actor.id, actor.email, scope],
  );
  if (!row) throw new Error("The letterhead draft could not be created.");
  return fromRow(actor, row);
}

export async function updateLetterhead(actor: CreateActor, id: string, input: Record<string, unknown>, scope: LetterheadScope = "create") {
  const cleanTitle = title(input.title);
  const cleanBody = sanitizeLetterheadBody(input.bodyHtml);
  const patch = {
    title: scope === "executive_board" ? applyExecutiveBoardIdentity(cleanTitle) : cleanTitle,
    bodyHtml: scope === "executive_board" ? applyExecutiveBoardIdentity(cleanBody) : cleanBody,
    paperSize: input.paperSize === "legal" ? "legal" : "a4",
    bottomMargin: input.bottomMargin === "small" ? "small" : "wide",
    hasSecondPage: Boolean(input.hasSecondPage),
    signatureX: numberInRange(input.signatureX, 0, 95, 62),
    signatureY: numberInRange(input.signatureY, 0, 95, 74),
    signatureWidth: numberInRange(input.signatureWidth, 5, 80, 24),
    signaturePage: input.signaturePage === "first" ? "first" : "last",
    stampX: numberInRange(input.stampX, 0, 95, 62),
    stampY: numberInRange(input.stampY, 0, 95, 68),
    stampWidth: numberInRange(input.stampWidth, 5, 80, 20),
    stampPage: input.stampPage === "first" ? "first" : "last",
  };
  const row = await glashMaybeOne<Record<string, unknown>>(
    `update public.create_letterheads set
       title = $4, body_html = $5, paper_size = $6, bottom_margin = $7, has_second_page = $8,
       signature_x = $9, signature_y = $10, signature_width = $11, signature_page = $12,
       stamp_x = $13, stamp_y = $14, stamp_width = $15, stamp_page = $16
     where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null
     returning ${RETURNING}`,
    [actor.kind, actor.id, id, patch.title, patch.bodyHtml, patch.paperSize, patch.bottomMargin, patch.hasSecondPage, patch.signatureX, patch.signatureY, patch.signatureWidth, patch.signaturePage, patch.stampX, patch.stampY, patch.stampWidth, patch.stampPage],
  );
  if (!row) throw new Error("This letterhead could not be saved.");
  if (Array.isArray(input.signatures)) {
    for (const value of input.signatures.slice(0, 20)) {
      if (!value || typeof value !== "object") continue;
      const signature = value as Record<string, unknown>;
      await glashQuery(
        `update public.create_letterhead_signatures placed set
           signature_x = $5, signature_y = $6, signature_width = $7, signature_page = $8
          from public.create_letterheads letterhead
         where placed.id = $4::uuid and placed.letterhead_id = $3::uuid
           and letterhead.id = placed.letterhead_id
           and letterhead.owner_kind = $1 and letterhead.owner_id = $2 and letterhead.deleted_at is null`,
        [actor.kind, actor.id, id, String(signature.id || ""), numberInRange(signature.signatureX, 0, 95, 54), numberInRange(signature.signatureY, 0, 95, 72), numberInRange(signature.signatureWidth, 5, 80, 22), signature.signaturePage === "first" ? "first" : "last"],
      );
    }
  }
  return fromRow(actor, row);
}

export async function duplicateLetterhead(actor: CreateActor, id: string) {
  const row = await glashMaybeOne<Record<string, unknown>>(
    `insert into public.create_letterheads
      (owner_kind, owner_id, actor_email, scope, title, body_html, paper_size, bottom_margin, has_second_page,
       first_page_path, first_page_name, first_page_size_bytes, second_page_path, second_page_name, second_page_size_bytes,
       signature_path, signature_name, signature_size_bytes, signature_x, signature_y, signature_width, signature_page,
       stamp_path, stamp_name, stamp_size_bytes, stamp_x, stamp_y, stamp_width, stamp_page, status)
     select owner_kind, owner_id, $4, scope, left(title || ' copy', 160), body_html, paper_size, bottom_margin, has_second_page,
       first_page_path, first_page_name, first_page_size_bytes, second_page_path, second_page_name, second_page_size_bytes,
       signature_path, signature_name, signature_size_bytes, signature_x, signature_y, signature_width, signature_page,
       stamp_path, stamp_name, stamp_size_bytes, stamp_x, stamp_y, stamp_width, stamp_page, 'draft'
     from public.create_letterheads
     where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null
     returning ${RETURNING}`,
    [actor.kind, actor.id, id, actor.email],
  );
  if (!row) throw new Error("This letterhead could not be duplicated.");
  await glashQuery(
    `insert into public.create_letterhead_signatures
       (letterhead_id, source, signer_name, signer_email, status, storage_path, storage_name, size_bytes,
        signature_x, signature_y, signature_width, signature_page, signed_at)
     select $2::uuid, 'upload', signer_name, signer_email, 'ready', storage_path, storage_name, size_bytes,
            signature_x, signature_y, signature_width, signature_page, signed_at
       from public.create_letterhead_signatures
      where letterhead_id = $1::uuid and status in ('ready', 'signed') and storage_path is not null`,
    [id, String(row.id)],
  );
  return fromRow(actor, row);
}

export async function markLetterheadExported(actor: CreateActor, id: string) {
  await glashQuery(
    `update public.create_letterheads set status = 'ready', last_exported_at = now()
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null`,
    [actor.kind, actor.id, id],
  );
}

export async function archiveLetterhead(actor: CreateActor, id: string) {
  await glashQuery(
    `update public.create_letterheads set status = 'archived', deleted_at = now()
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null`,
    [actor.kind, actor.id, id],
  );
}

export async function getLetterheadAssetReplacement(actor: CreateActor, id: string, kind: LetterheadAssetKind) {
  const pathColumn = kind === "firstPage" ? "first_page_path" : kind === "secondPage" ? "second_page_path" : kind === "signature" ? "signature_path" : "stamp_path";
  const sizeColumn = kind === "firstPage" ? "first_page_size_bytes" : kind === "secondPage" ? "second_page_size_bytes" : kind === "signature" ? "signature_size_bytes" : "stamp_size_bytes";
  const row = await glashMaybeOne<{ path: string | null; bytes: string; reference_count: string }>(
    `select current.${pathColumn} as path, current.${sizeColumn}::text as bytes,
            case when current.${pathColumn} is null then 0 else (
              select coalesce(sum(
                coalesce((sibling.first_page_path = current.${pathColumn})::int, 0)
                + coalesce((sibling.second_page_path = current.${pathColumn})::int, 0)
                + coalesce((sibling.signature_path = current.${pathColumn})::int, 0)
                + coalesce((sibling.stamp_path = current.${pathColumn})::int, 0)
              ), 0) from public.create_letterheads sibling
               where sibling.owner_kind = $1 and sibling.owner_id = $2 and sibling.deleted_at is null
            ) end::text as reference_count
       from public.create_letterheads current
      where current.id = $3::uuid and current.owner_kind = $1 and current.owner_id = $2 and current.deleted_at is null`,
    [actor.kind, actor.id, id],
  );
  return {
    path: row?.path || null,
    bytes: Number(row?.bytes || 0),
    referenceCount: Number(row?.reference_count || 0),
  };
}

/**
 * Takes an asset off a document: a signature that was the wrong one, or a seal
 * that should not be on this letter. The stored object is only removed when no
 * duplicate of the document still points at it.
 */
export async function clearLetterheadAsset(actor: CreateActor, id: string, kind: LetterheadAssetKind) {
  const previous = await getLetterheadAssetReplacement(actor, id, kind);
  const columns = kind === "firstPage"
    ? ["first_page_path", "first_page_name", "first_page_size_bytes"]
    : kind === "secondPage"
      ? ["second_page_path", "second_page_name", "second_page_size_bytes"]
      : kind === "signature"
        ? ["signature_path", "signature_name", "signature_size_bytes"]
        : ["stamp_path", "stamp_name", "stamp_size_bytes"];
  const row = await glashMaybeOne<Record<string, unknown>>(
    `update public.create_letterheads set ${columns[0]} = null, ${columns[1]} = null, ${columns[2]} = 0
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null
      returning ${RETURNING}`,
    [actor.kind, actor.id, id],
  );
  if (!row) throw new Error("The document could not be found.");
  return { letterhead: await fromRow(actor, row), previous };
}

export async function updateLetterheadAsset(actor: CreateActor, id: string, kind: LetterheadAssetKind, path: string, name: string, sizeBytes: number) {
  if (!isCreatePrivateAssetPath(actor, path)) {
    throw new Error("The uploaded asset does not belong to this workspace.");
  }
  const columns = kind === "firstPage"
    ? ["first_page_path", "first_page_name", "first_page_size_bytes"]
    : kind === "secondPage"
      ? ["second_page_path", "second_page_name", "second_page_size_bytes"]
      : kind === "signature"
        ? ["signature_path", "signature_name", "signature_size_bytes"]
        : ["stamp_path", "stamp_name", "stamp_size_bytes"];
  const row = await glashMaybeOne<Record<string, unknown>>(
    `update public.create_letterheads set ${columns[0]} = $4, ${columns[1]} = $5, ${columns[2]} = $6
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null
      returning ${RETURNING}`,
    [actor.kind, actor.id, id, path, name.slice(0, 180), Math.max(0, Math.ceil(sizeBytes))],
  );
  if (!row) throw new Error("The uploaded asset could not be attached.");
  // Duplicated documents intentionally share immutable private assets. Keep the
  // previous object when one document replaces its reference so a duplicate is
  // never left with a broken background or signature.
  return fromRow(actor, row);
}
