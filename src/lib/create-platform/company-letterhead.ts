import "server-only";

import crypto from "node:crypto";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";
import {
  createPrivateAssetPrefix,
  LETTERHEAD_BUCKET,
  updateLetterheadAsset,
} from "@/lib/create-platform/letterheads";
import type { CreateActor } from "@/lib/create-platform/session";

/**
 * The single CDS Space letterhead used by Executive Board documents.
 *
 * The CREATE studio uploads a design per document, which suits client work.
 * Official company correspondence is the opposite: one letterhead, applied to
 * every letter, so nothing goes out on the wrong paper. The design is stored
 * once here and copied into each new document, which keeps every existing
 * ownership and rendering rule untouched.
 */
export const COMPANY_LETTERHEAD_PREFIX = "company-letterhead";

export type CompanyLetterhead = {
  firstPagePath: string | null;
  firstPageName: string | null;
  secondPagePath: string | null;
  secondPageName: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export async function getCompanyLetterhead(): Promise<CompanyLetterhead> {
  const row = await glashMaybeOne<{
    first_page_path: string | null;
    first_page_name: string | null;
    second_page_path: string | null;
    second_page_name: string | null;
    updated_by: string | null;
    updated_at: string | null;
  }>(`select first_page_path, first_page_name, second_page_path, second_page_name, updated_by, updated_at::text
        from public.company_letterhead where id = true`);
  return {
    firstPagePath: row?.first_page_path ?? null,
    firstPageName: row?.first_page_name ?? null,
    secondPagePath: row?.second_page_path ?? null,
    secondPageName: row?.second_page_name ?? null,
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function setCompanyLetterheadPage(input: {
  page: "first" | "second";
  path: string;
  name: string;
  updatedBy: string;
}) {
  const columns = input.page === "first"
    ? ["first_page_path", "first_page_name"]
    : ["second_page_path", "second_page_name"];
  await glashQuery(
    `insert into public.company_letterhead (id, ${columns[0]}, ${columns[1]}, updated_by, updated_at)
     values (true, $1, $2, $3, now())
     on conflict (id) do update set
       ${columns[0]} = excluded.${columns[0]},
       ${columns[1]} = excluded.${columns[1]},
       updated_by = excluded.updated_by,
       updated_at = now()`,
    [input.path, input.name, input.updatedBy],
  );
}

export async function clearCompanyLetterheadPage(page: "first" | "second", updatedBy: string) {
  const columns = page === "first"
    ? ["first_page_path", "first_page_name"]
    : ["second_page_path", "second_page_name"];
  await glashQuery(
    `update public.company_letterhead
        set ${columns[0]} = null, ${columns[1]} = null, updated_by = $1, updated_at = now()
      where id = true`,
    [updatedBy],
  );
}

/**
 * Copies the company design into a new document, so the document owns its own
 * copy of the file exactly as an uploaded one would. Changing the company
 * letterhead later therefore does not rewrite letters already written.
 */
export async function applyCompanyLetterhead(actor: CreateActor, documentId: string) {
  const company = await getCompanyLetterhead();
  if (!company.firstPagePath) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getGlashDbAdmin() as any;
  const prefix = createPrivateAssetPrefix(actor);
  let applied = false;
  let continuationApplied = false;

  for (const page of ["first", "second"] as const) {
    const path = page === "first" ? company.firstPagePath : company.secondPagePath;
    const name = (page === "first" ? company.firstPageName : company.secondPageName) || "CDS Space letterhead";
    if (!path) continue;
    try {
      const { data, error } = await db.storage.from(LETTERHEAD_BUCKET).download(path);
      if (error || !data) continue;
      const bytes = Buffer.from(await data.arrayBuffer());
      const kind = page === "first" ? "firstPage" : "secondPage";
      const target = `${prefix}/${documentId}/${kind}-${crypto.randomUUID()}.png`;
      const { error: uploadError } = await db.storage
        .from(LETTERHEAD_BUCKET)
        .upload(target, bytes, { contentType: "image/png", upsert: false });
      if (uploadError) continue;
      await updateLetterheadAsset(actor, documentId, kind, target, name, bytes.byteLength);
      applied = true;
      if (page === "second") continuationApplied = true;
    } catch (error) {
      console.error("[company-letterhead] could not apply the company design", error);
    }
  }
  if (continuationApplied) {
    await glashQuery(
      `update public.create_letterheads
          set has_second_page = true, updated_at = now()
        where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null`,
      [actor.kind, actor.id, documentId],
    );
  }
  return applied;
}
