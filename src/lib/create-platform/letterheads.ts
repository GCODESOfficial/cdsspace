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
  status: "draft" | "ready" | "archived";
  deliveredByCds: boolean;
  deliveredAt: string | null;
  lastExportedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
function assetUrl(actor: CreateActor, id: unknown, kind: "firstPage" | "secondPage" | "signature", path: unknown) {
  if (typeof path !== "string" || !path) return null;
  const version = path.split("/").pop() || "";
  return `/api/create/letterheads/${encodeURIComponent(String(id))}/asset/${kind}?workspace=${actor.kind}&v=${encodeURIComponent(version)}`;
}

async function fromRow(actor: CreateActor, row: Record<string, unknown>): Promise<LetterheadRecord> {
  const scope = letterheadScope(row.scope);
  const bodyHtml = String(row.body_html || "");
  const documentTitle = String(row.title || "Untitled letter");
  const firstPageUrl = assetUrl(actor, row.id, "firstPage", row.first_page_path);
  const secondPageUrl = assetUrl(actor, row.id, "secondPage", row.second_page_path);
  const signatureUrl = assetUrl(actor, row.id, "signature", row.signature_path);
  return {
    id: String(row.id),
    scope,
    title: scope === "executive_board" ? applyExecutiveBoardIdentity(documentTitle) : documentTitle,
    bodyHtml: scope === "executive_board" ? applyExecutiveBoardIdentity(bodyHtml) : bodyHtml,
    paperSize: row.paper_size === "legal" ? "legal" : "a4",
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
    status: row.status === "ready" || row.status === "archived" ? row.status : "draft",
    deliveredByCds: Boolean(row.delivered_by_cds),
    deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
    lastExportedAt: row.last_exported_at ? String(row.last_exported_at) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

const RETURNING = `id, scope, title, body_html, paper_size, has_second_page,
  first_page_path, first_page_name, first_page_size_bytes, second_page_path, second_page_name, second_page_size_bytes,
  signature_path, signature_name, signature_size_bytes, signature_x, signature_y, signature_width,
  signature_page, status, delivered_by_cds, delivered_from_letterhead_id,
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
    hasSecondPage: Boolean(input.hasSecondPage),
    signatureX: numberInRange(input.signatureX, 0, 95, 62),
    signatureY: numberInRange(input.signatureY, 0, 95, 74),
    signatureWidth: numberInRange(input.signatureWidth, 5, 80, 24),
    signaturePage: input.signaturePage === "first" ? "first" : "last",
  };
  const row = await glashMaybeOne<Record<string, unknown>>(
    `update public.create_letterheads set
       title = $4, body_html = $5, paper_size = $6, has_second_page = $7,
       signature_x = $8, signature_y = $9, signature_width = $10, signature_page = $11
     where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null
     returning ${RETURNING}`,
    [actor.kind, actor.id, id, patch.title, patch.bodyHtml, patch.paperSize, patch.hasSecondPage, patch.signatureX, patch.signatureY, patch.signatureWidth, patch.signaturePage],
  );
  if (!row) throw new Error("This letterhead could not be saved.");
  return fromRow(actor, row);
}

export async function duplicateLetterhead(actor: CreateActor, id: string) {
  const row = await glashMaybeOne<Record<string, unknown>>(
    `insert into public.create_letterheads
      (owner_kind, owner_id, actor_email, scope, title, body_html, paper_size, has_second_page,
       first_page_path, first_page_name, first_page_size_bytes, second_page_path, second_page_name, second_page_size_bytes,
       signature_path, signature_name, signature_size_bytes, signature_x, signature_y, signature_width, signature_page, status)
     select owner_kind, owner_id, $4, scope, left(title || ' copy', 160), body_html, paper_size, has_second_page,
       first_page_path, first_page_name, first_page_size_bytes, second_page_path, second_page_name, second_page_size_bytes,
       signature_path, signature_name, signature_size_bytes, signature_x, signature_y, signature_width, signature_page, 'draft'
     from public.create_letterheads
     where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null
     returning ${RETURNING}`,
    [actor.kind, actor.id, id, actor.email],
  );
  if (!row) throw new Error("This letterhead could not be duplicated.");
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

export async function getLetterheadAssetReplacement(actor: CreateActor, id: string, kind: "firstPage" | "secondPage" | "signature") {
  const pathColumn = kind === "firstPage" ? "first_page_path" : kind === "secondPage" ? "second_page_path" : "signature_path";
  const sizeColumn = kind === "firstPage" ? "first_page_size_bytes" : kind === "secondPage" ? "second_page_size_bytes" : "signature_size_bytes";
  const row = await glashMaybeOne<{ path: string | null; bytes: string; reference_count: string }>(
    `select current.${pathColumn} as path, current.${sizeColumn}::text as bytes,
            case when current.${pathColumn} is null then 0 else (
              select coalesce(sum(
                coalesce((sibling.first_page_path = current.${pathColumn})::int, 0)
                + coalesce((sibling.second_page_path = current.${pathColumn})::int, 0)
                + coalesce((sibling.signature_path = current.${pathColumn})::int, 0)
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

export async function updateLetterheadAsset(actor: CreateActor, id: string, kind: "firstPage" | "secondPage" | "signature", path: string, name: string, sizeBytes: number) {
  if (!isCreatePrivateAssetPath(actor, path)) {
    throw new Error("The uploaded asset does not belong to this workspace.");
  }
  const columns = kind === "firstPage"
    ? ["first_page_path", "first_page_name", "first_page_size_bytes"]
    : kind === "secondPage"
      ? ["second_page_path", "second_page_name", "second_page_size_bytes"]
      : ["signature_path", "signature_name", "signature_size_bytes"];
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
