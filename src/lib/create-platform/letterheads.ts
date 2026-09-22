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
      font: ["color"],
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
  const firstPageUrl = assetUrl(actor, row.id, "firstPage", row.first_page_path);
  const secondPageUrl = assetUrl(actor, row.id, "secondPage", row.second_page_path);
  const signatureUrl = assetUrl(actor, row.id, "signature", row.signature_path);
  return {
    id: String(row.id),
    title: String(row.title || "Untitled letter"),
    bodyHtml: String(row.body_html || ""),
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
    lastExportedAt: row.last_exported_at ? String(row.last_exported_at) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

const RETURNING = `id, title, body_html, paper_size, has_second_page,
  first_page_path, first_page_name, second_page_path, second_page_name,
  signature_path, signature_name, signature_x, signature_y, signature_width,
  signature_page, status, last_exported_at, created_at, updated_at`;

export async function listLetterheads(actor: CreateActor) {
  const rows = await glashQuery<Record<string, unknown>>(
    `select ${RETURNING} from public.create_letterheads
      where owner_kind = $1 and owner_id = $2 and deleted_at is null and status <> 'archived'
      order by updated_at desc limit 60`,
    [actor.kind, actor.id],
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

export async function createLetterhead(actor: CreateActor) {
  const row = await glashMaybeOne<Record<string, unknown>>(
    `insert into public.create_letterheads (owner_kind, owner_id, actor_email)
     values ($1, $2, $3) returning ${RETURNING}`,
    [actor.kind, actor.id, actor.email],
  );
  if (!row) throw new Error("The letterhead draft could not be created.");
  return fromRow(actor, row);
}

export async function updateLetterhead(actor: CreateActor, id: string, input: Record<string, unknown>) {
  const patch = {
    title: title(input.title),
    bodyHtml: sanitizeLetterheadBody(input.bodyHtml),
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
      (owner_kind, owner_id, actor_email, title, body_html, paper_size, has_second_page,
       first_page_path, first_page_name, second_page_path, second_page_name,
       signature_path, signature_name, signature_x, signature_y, signature_width, signature_page, status)
     select owner_kind, owner_id, $4, left(title || ' copy', 160), body_html, paper_size, has_second_page,
       first_page_path, first_page_name, second_page_path, second_page_name,
       signature_path, signature_name, signature_x, signature_y, signature_width, signature_page, 'draft'
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

export async function updateLetterheadAsset(actor: CreateActor, id: string, kind: "firstPage" | "secondPage" | "signature", path: string, name: string) {
  if (!isCreatePrivateAssetPath(actor, path)) {
    throw new Error("The uploaded asset does not belong to this workspace.");
  }
  const columns = kind === "firstPage"
    ? ["first_page_path", "first_page_name"]
    : kind === "secondPage"
      ? ["second_page_path", "second_page_name"]
      : ["signature_path", "signature_name"];
  const row = await glashMaybeOne<Record<string, unknown>>(
    `update public.create_letterheads set ${columns[0]} = $4, ${columns[1]} = $5
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null
      returning ${RETURNING}`,
    [actor.kind, actor.id, id, path, name.slice(0, 180)],
  );
  if (!row) throw new Error("The uploaded asset could not be attached.");
  // Duplicated documents intentionally share immutable private assets. Keep the
  // previous object when one document replaces its reference so a duplicate is
  // never left with a broken background or signature.
  return fromRow(actor, row);
}
