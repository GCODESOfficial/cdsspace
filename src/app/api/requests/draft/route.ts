import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import sanitizeHtml from "sanitize-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanAssets(value: unknown, userId: string) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => clean(item, 600)).filter((item) => item.startsWith(`${userId}/`)))).slice(0, 5);
}

function cleanBrief(value: unknown) {
  return sanitizeHtml(clean(value, 12_000), {
    allowedTags: ["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u"],
    allowedAttributes: {},
  });
}

export async function GET() {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const draft = await glashMaybeOne(
    "select id, title, description, category, asset_paths, updated_at from public.design_request_drafts where user_id = $1 limit 1",
    [session.user.id],
  );
  return NextResponse.json({ draft });
}

export async function PUT(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const category = ["carousel", "social_post", "ad", "email", "social", "other"].includes(body.category) ? body.category : "other";
  const draft = await glashMaybeOne(
    `insert into public.design_request_drafts (user_id, title, description, category, asset_paths)
     values ($1,$2,$3,$4,$5::text[])
     on conflict (user_id) do update
       set title = excluded.title, description = excluded.description, category = excluded.category,
           asset_paths = excluded.asset_paths, updated_at = now()
     returning id, title, description, category, asset_paths, updated_at`,
    [session.user.id, clean(body.title, 180), cleanBrief(body.description), category, cleanAssets(body.asset_paths, session.user.id)],
  );
  return NextResponse.json({ draft });
}

export async function DELETE() {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await glashQuery("delete from public.design_request_drafts where user_id = $1", [session.user.id]);
  return NextResponse.json({ ok: true });
}
