import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { renderPageAsImage } from "unpdf";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { LETTERHEAD_BUCKET, LETTERHEAD_MAX_BYTES } from "@/lib/create-platform/letterheads";
import {
  COMPANY_LETTERHEAD_PREFIX,
  clearCompanyLetterheadPage,
  getCompanyLetterhead,
  setCompanyLetterheadPage,
} from "@/lib/create-platform/company-letterhead";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "pdf", "svg"]);

/**
 * The one CDS Space letterhead, which every Executive Board document is
 * written on. Stored as a flat image the same way the CREATE studio stores an
 * uploaded design, so the export and preview paths need no special case.
 */
function extension(name: string) {
  return name.toLowerCase().split(".").pop()?.replace(/[^a-z0-9]/g, "") || "";
}

async function pngFromUpload(file: File) {
  const ext = extension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new UploadSecurityError("Upload a JPG, PNG, PDF, or SVG file.");
  const safe = await assertSafeUpload(file, { allow: ["image", "pdf", "design"], maxBytes: LETTERHEAD_MAX_BYTES, imageMaxDimension: 16000 });
  if (safe.kind === "pdf") {
    const rendered = await renderPageAsImage(new Uint8Array(safe.buffer), 1, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: 2,
    });
    return sharp(Buffer.from(rendered)).png().toBuffer();
  }
  if (ext === "svg") return sharp(safe.buffer, { density: 220 }).png().toBuffer();
  return sharp(safe.buffer).png().toBuffer();
}

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "executive_board.letterhead_view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const company = await getCompanyLetterhead();
  return NextResponse.json({
    ok: true,
    firstPageName: company.firstPageName,
    secondPageName: company.secondPageName,
    hasFirstPage: Boolean(company.firstPagePath),
    hasSecondPage: Boolean(company.secondPagePath),
    updatedBy: company.updatedBy,
    updatedAt: company.updatedAt,
  }, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
}

export async function POST(req: NextRequest) {
  // Setting company stationery changes every letter written afterwards, so it
  // sits behind the manage permission rather than the view one.
  const { session, denied } = await requireAdmin(req, "executive_board.letterhead_manage");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const page = form?.get("page") === "second" ? "second" : "first";
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a letterhead file." }, { status: 400 });
  }
  if (file.size > LETTERHEAD_MAX_BYTES) {
    return NextResponse.json({ error: "The letterhead must be 5MB or smaller." }, { status: 413 });
  }

  try {
    const png = await pngFromUpload(file);
    const path = `${COMPANY_LETTERHEAD_PREFIX}/${page}-${crypto.randomUUID()}.png`;
    const previous = await getCompanyLetterhead();
    const previousPath = page === "first" ? previous.firstPagePath : previous.secondPagePath;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = getGlashDbAdmin() as any;
    const { error } = await db.storage.from(LETTERHEAD_BUCKET).upload(path, png, { contentType: "image/png", upsert: false });
    if (error) throw new Error(error.message);

    await setCompanyLetterheadPage({
      page,
      path,
      name: file.name.slice(0, 180),
      updatedBy: String(session.email || session.name || "admin"),
    });
    if (previousPath && previousPath !== path) {
      await db.storage.from(LETTERHEAD_BUCKET).remove([previousPath]).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, page, name: file.name });
  } catch (error) {
    const message = error instanceof UploadSecurityError
      ? error.message
      : error instanceof Error ? error.message : "The letterhead could not be saved.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "executive_board.letterhead_manage");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const page = new URL(req.url).searchParams.get("page") === "second" ? "second" : "first";
  const company = await getCompanyLetterhead();
  const previousPath = page === "first" ? company.firstPagePath : company.secondPagePath;
  await clearCompanyLetterheadPage(page, String(session.email || session.name || "admin"));
  if (previousPath) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = getGlashDbAdmin() as any;
    await db.storage.from(LETTERHEAD_BUCKET).remove([previousPath]).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
