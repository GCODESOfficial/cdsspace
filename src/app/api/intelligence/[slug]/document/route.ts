import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbServiceRoleConfig } from "@/lib/glashdb/env";
import { requestFingerprint } from "@/lib/intelligence/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "intelligence-documents";
type Params = Promise<{ slug: string }>;

type DocumentPublication = {
  id: string;
  pdf_storage_path: string | null;
  pdf_display_name: string | null;
  pdf_access_mode: "view" | "download" | "download_print";
  access_level: "public" | "account" | "private_client" | "hidden";
  assigned_client_id: string | null;
  private_token: string | null;
  access_expires_at: string | null;
  status: string;
  published_at: string | null;
};

const getDocumentPublication = unstable_cache(
  (slug: string) => glashMaybeOne<DocumentPublication>(
    `select id, pdf_storage_path, pdf_display_name, pdf_access_mode, access_level,
            assigned_client_id, private_token::text, access_expires_at, status, published_at
     from public.blog_posts where slug = $1 and deleted_at is null limit 1`,
    [slug],
  ),
  ["intelligence-document-publication-v1"],
  { revalidate: 60 },
);

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { slug } = await params;
  const publication = await getDocumentPublication(slug);
  if (!publication?.pdf_storage_path) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  if (publication.access_expires_at && new Date(publication.access_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "This private report link has expired." }, { status: 410 });
  }

  const requestedMode = req.nextUrl.searchParams.get("mode") || "view";
  const mode = requestedMode === "download" || requestedMode === "print" || requestedMode === "preview"
    ? requestedMode
    : "view";
  const token = req.nextUrl.searchParams.get("token");
  const publicLive = publication.access_level === "public" &&
    (publication.status === "published" || (publication.status === "scheduled" && publication.published_at && new Date(publication.published_at) <= new Date()));
  let user: { id: string } | null = null;
  // PDF.js can make several byte-range requests for one page. Public previews
  // do not need an auth-network round trip on every chunk; protected reports
  // and explicit view/download/print requests still resolve the current user.
  if (!publicLive || mode !== "preview") {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  const accountAllowed = publication.access_level === "account" && Boolean(user);
  const privateAllowed = publication.access_level === "private_client" &&
    ((user?.id && user.id === publication.assigned_client_id) || (token && token === publication.private_token));
  if (!publicLive && !accountAllowed && !privateAllowed) return NextResponse.json({ ok: false, error: "You do not have access to this report." }, { status: 403 });

  if (mode === "download" && publication.pdf_access_mode === "view") return NextResponse.json({ ok: false, error: "Downloads are disabled for this report." }, { status: 403 });
  if (mode === "print" && publication.pdf_access_mode !== "download_print") return NextResponse.json({ ok: false, error: "Printing is disabled for this report." }, { status: 403 });

  // Keep the storage origin behind this authorised, same-origin route. The
  // public-object endpoint is also used for private buckets with service-role
  // authentication and, unlike the generic object endpoint, preserves HTTP
  // byte ranges. PDF.js can therefore fetch only the chunks needed for a page
  // instead of downloading a large report in full before rendering anything.
  const storagePathParts = publication.pdf_storage_path.split("/").filter(Boolean);
  if (!storagePathParts.length || storagePathParts.some((part) => part === "." || part === "..")) {
    return NextResponse.json({ ok: false, error: "Invalid document path." }, { status: 500 });
  }
  const config = getGlashDbServiceRoleConfig();
  const objectPath = storagePathParts.map(encodeURIComponent).join("/");
  const objectUrl = `${config.url.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${objectPath}`;
  const range = req.headers.get("range");
  const upstream = await fetch(objectUrl, {
    cache: "no-store",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      ...(range ? { Range: range } : {}),
    },
  }).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    return NextResponse.json({ ok: false, error: "Could not load the document." }, { status: upstream?.status || 502 });
  }

  if (mode !== "preview") {
    const eventType = mode === "download" ? "download" : mode === "print" ? "print" : "pdf_open";
    const fingerprint = requestFingerprint(req);
    await glashQuery(
      `insert into public.intelligence_events (post_id, user_id, visitor_key, event_type, metadata)
       values ($1,$2,$3,$4,'{}'::jsonb)`,
      [publication.id, user?.id || null, fingerprint, eventType],
    ).catch(() => {});
    if (mode === "download") await glashQuery(`update public.blog_posts set downloads_count = downloads_count + 1 where id = $1`, [publication.id]).catch(() => {});
  }

  const fallbackName = "CDS-Space-Intelligence.pdf";
  const displayName = (publication.pdf_display_name || fallbackName)
    .replace(/[\r\n"\\]/g, "-")
    .slice(0, 160);
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `${mode === "download" ? "attachment" : "inline"}; filename="${displayName}"`,
    "Cache-Control": publicLive
      ? "private, max-age=300, stale-while-revalidate=3600"
      : "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": "frame-ancestors 'self'",
  });
  for (const name of ["accept-ranges", "content-length", "content-range", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
