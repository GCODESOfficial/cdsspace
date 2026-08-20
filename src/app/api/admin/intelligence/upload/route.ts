import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import { assertTrustedMutationOrigin, cleanText } from "@/lib/intelligence/security";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";
import { optimizeIntelligencePdf } from "@/lib/intelligence/pdf-optimizer";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUCKET = "intelligence-documents";
const MEDIA_BUCKET = "media";
const MAX_BYTES = 75 * 1024 * 1024;

function canManage(session: AdminSession) {
  return session.role === "super_admin" || hasPermission(session.permissions, "blog");
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !canManage(session)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const postId = req.nextUrl.searchParams.get("postId");
  if (!postId) return NextResponse.json({ ok: false, error: "postId is required" }, { status: 400 });
  const versions = await glashQuery(
    `select id, version_number, display_name, file_size, page_count, uploaded_by, malware_scan_status, created_at
     from public.intelligence_document_versions where post_id = $1 order by version_number desc`,
    [postId],
  );
  return NextResponse.json({ ok: true, versions });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !canManage(session)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  if (!checkIntelligenceRateLimit(`intelligence-upload:${session.email}`, 12, 10 * 60_000).allowed) {
    return NextResponse.json({ ok: false, error: "Upload limit reached. Please wait and try again." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const postId = cleanText(form?.get("postId"), 80);
  if (!(file instanceof File) || !postId) return NextResponse.json({ ok: false, error: "A PDF and publication are required." }, { status: 400 });
  const publication = await glashMaybeOne<{ id: string; slug: string; cover_url: string | null; pdf_preview_url: string | null }>(
    `select id, slug, cover_url, pdf_preview_url from public.blog_posts where id = $1 and deleted_at is null`,
    [postId],
  );
  if (!publication) return NextResponse.json({ ok: false, error: "Publication not found." }, { status: 404 });

  const storage = getSupabaseAdmin() as any;
  let storagePath = "";
  let generatedCoverPath = "";
  try {
    const safe = await assertSafeUpload(file, { allow: ["pdf"], maxBytes: MAX_BYTES });
    const optimization = await optimizeIntelligencePdf(safe.buffer);
    let storedPdf = optimization.buffer;
    let pageCount: number;
    let generatedCover: Buffer | null = null;
    try {
      const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
      let pdfBytes = Uint8Array.from(storedPdf);
      let pdf = await getDocumentProxy(pdfBytes.slice());
      pageCount = pdf.numPages;
      await pdf.destroy();

      // An optimizer bug must never replace a valid upload with an unreadable
      // document. Re-validate and render the original bytes in that rare case.
      try {
        const renderedFirstPage = Buffer.from(await renderPageAsImage(pdfBytes.slice(), 1, {
          width: 1280,
          canvasImport: () => import("@napi-rs/canvas"),
        }));
        generatedCover = await sharp(renderedFirstPage).webp({ quality: 84, effort: 4 }).toBuffer();
      } catch (error) {
        if (!optimization.optimized) throw error;
        storedPdf = safe.buffer;
        pdfBytes = Uint8Array.from(storedPdf);
        pdf = await getDocumentProxy(pdfBytes.slice());
        pageCount = pdf.numPages;
        await pdf.destroy();
        const renderedFirstPage = Buffer.from(await renderPageAsImage(pdfBytes.slice(), 1, {
          width: 1280,
          canvasImport: () => import("@napi-rs/canvas"),
        }));
        generatedCover = await sharp(renderedFirstPage).webp({ quality: 84, effort: 4 }).toBuffer();
      }
    } catch {
      throw new UploadSecurityError("The PDF could not be read or its cover could not be generated.", 422);
    }

    storagePath = `${postId}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await storage.storage.from(BUCKET).upload(storagePath, storedPdf, {
      contentType: "application/pdf",
      cacheControl: "private, max-age=0, no-store",
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);

    let generatedCoverUrl: string | null = null;
    if (generatedCover) {
      generatedCoverPath = `intelligence/pdf-previews/${postId}/${crypto.randomUUID()}.webp`;
      const { error: coverUploadError } = await storage.storage.from(MEDIA_BUCKET).upload(generatedCoverPath, generatedCover, {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
        upsert: false,
      });
      if (coverUploadError) throw new Error(`PDF uploaded, but its cover could not be saved: ${coverUploadError.message}`);
      generatedCoverUrl = storage.storage.from(MEDIA_BUCKET).getPublicUrl(generatedCoverPath).data.publicUrl;
    }

    const version = await glashMaybeOne<{ id: string; version_number: number }>(
      `insert into public.intelligence_document_versions
        (post_id, version_number, storage_path, display_name, file_size, page_count, uploaded_by)
       values ($1,
         coalesce((select max(version_number) + 1 from public.intelligence_document_versions where post_id = $1), 1),
         $2,$3,$4,$5,$6)
       returning id, version_number`,
      [postId, storagePath, cleanText(file.name, 180) || "Intelligence report.pdf", storedPdf.length, pageCount, session.email],
    );
    await glashQuery(
      `update public.blog_posts
       set pdf_storage_path = $2,
           pdf_display_name = $3,
           pdf_page_count = $4,
           pdf_preview_url = $5,
           cover_url = case
             when cover_url is null or cover_url = '' or cover_url like '%/intelligence/pdf-previews/%' then $5
             else cover_url
           end,
           updated_at = now()
       where id = $1`,
      [postId, storagePath, cleanText(file.name, 180) || "Intelligence report.pdf", pageCount, generatedCoverUrl],
    );
    await logActivity({
      action: "intelligence.document_upload", page: "intelligence", resource_type: "intelligence_publication",
      resource_id: postId, resource_label: publication.slug,
      metadata: {
        version: version?.version_number,
        size: storedPdf.length,
        original_size: safe.buffer.length,
        bytes_saved: safe.buffer.length - storedPdf.length,
        compression_percent: safe.buffer.length > 0 ? Number((((safe.buffer.length - storedPdf.length) / safe.buffer.length) * 100).toFixed(1)) : 0,
        optimized: storedPdf !== safe.buffer,
        linearized: storedPdf !== safe.buffer && optimization.linearized,
        optimizer_fallback: storedPdf === safe.buffer ? optimization.fallbackReason || "optimized-output-validation-failed" : null,
        optimizer_stats: storedPdf !== safe.buffer ? optimization.stats : null,
        page_count: pageCount,
        cover_generated: Boolean(generatedCoverUrl),
      },
    });
    return NextResponse.json({
      ok: true,
      storagePath,
      pageCount,
      version: version?.version_number,
      displayName: file.name,
      coverUrl: publication.cover_url || generatedCoverUrl,
      previewUrl: generatedCoverUrl,
      optimization: {
        optimized: storedPdf !== safe.buffer,
        linearized: storedPdf !== safe.buffer && optimization.linearized,
        originalBytes: safe.buffer.length,
        storedBytes: storedPdf.length,
        savedBytes: safe.buffer.length - storedPdf.length,
        savingsPercent: safe.buffer.length > 0 ? Number((((safe.buffer.length - storedPdf.length) / safe.buffer.length) * 100).toFixed(1)) : 0,
      },
    });
  } catch (error) {
    if (storagePath) await storage.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    if (generatedCoverPath) await storage.storage.from(MEDIA_BUCKET).remove([generatedCoverPath]).catch(() => {});
    const status = error instanceof UploadSecurityError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "PDF upload failed." }, { status });
  }
}
