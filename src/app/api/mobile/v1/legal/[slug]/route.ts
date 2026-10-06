import { isLegalSlug } from "@/lib/legal/default-content";
import { loadLegalDocument } from "@/lib/legal/server";
import { mobileJson } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

// A legal page (terms, privacy, …) for the app's native Legal screen: the same
// content the public page renders (src/app/(marketing)/terms/page.tsx). Public,
// like those pages.
export async function GET(_request: Request, { params }: { params: Params }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) return mobileJson({ error: "Not found" }, 404);
  const doc = await loadLegalDocument(slug);
  return mobileJson({
    document: {
      slug,
      title: doc.title,
      subtitle: doc.subtitle || null,
      effectiveDate: doc.effective_date || null,
      version: doc.version || null,
      updatedAt: doc.updated_at || null,
      contentHtml: doc.content || "",
      pdfUrl: `/api/legal/${slug}/download`,
    },
  });
}
