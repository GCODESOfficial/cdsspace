import { NextResponse } from "next/server";
import { financeDb } from "@/lib/finance/api-auth";
import { attachBrandIdentityFiles } from "@/lib/brand-identity-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-z0-9_-]{24,160}$/i.test(token)) {
    return NextResponse.json({ error: "Brand Identity not found." }, { status: 404 });
  }

  try {
    const db = financeDb();
    const { data, error } = await db
      .from("brand_identity_deliveries")
      .select("*")
      .eq("public_token", token)
      .eq("is_public", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.published_at) return NextResponse.json({ error: "Brand Identity not found." }, { status: 404 });

    const projectResult = data.project_id
      ? await db.from("finance_projects").select("id, name, client").eq("id", data.project_id).maybeSingle()
      : { data: null };

    const identity = await attachBrandIdentityFiles(db, {
      ...data,
      finance_projects: projectResult.data || null,
    }, 60 * 60 * 6);
    // Do not expose ownership UUIDs or internal project/brief references on the
    // no-account public surface.
    return NextResponse.json({
      identity: {
        title: identity.title,
        description: identity.description,
        project_name: identity.project_name,
        client_name: identity.client_name,
        public_token: identity.public_token,
        published_at: identity.published_at,
        files: identity.files,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load this Brand Identity." }, { status: 500 });
  }
}
