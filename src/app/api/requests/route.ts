import { after, NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";
import sanitizeHtml from "sanitize-html";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_CATEGORIES = new Set(["carousel", "social_post", "ad", "email", "social", "other"]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanBrief(value: unknown) {
  return sanitizeHtml(cleanText(value, 12_000), {
    allowedTags: ["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u"],
    allowedAttributes: {},
  });
}

function cleanAssetPaths(value: unknown, userId: string) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => cleanText(item, 600))
    .filter((item) => item.startsWith(`${userId}/`))))
    .slice(0, 5);
}

function quotaLimit(plan: string, quantity: number | null) {
  if (plan.toLowerCase() === "startup") return 5;
  if (plan.toLowerCase() === "scaleup") return 10;
  return Math.max(Number(quantity || 1), 1);
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const expected = /required|add enough|up to five|used all|entered production|no longer|not found/i.test(message);
  return NextResponse.json({ error: expected ? message : fallback }, { status: expected ? 409 : 500 });
}

export async function GET() {
  try {
    const session = await verifyUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [payload, subscription] = await Promise.all([
      glashMaybeOne<{ requests: unknown[] }>(
        `select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) as requests
           from public.design_requests r
          where r.user_id = $1`,
        [session.user.id],
      ),
      glashMaybeOne<{ plan: string; design_quantity: number | null; design_count: number; last_reset_at: string | null }>(
        `select plan, design_quantity, design_count, last_reset_at
           from public.subscriptions
          where user_id = $1 and status = 'active'
          order by activated_at desc nulls last, created_at desc
          limit 1`,
        [session.user.id],
      ),
    ]);
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const periodStart = `${dateParts.slice(0, 7)}-01`;
    const lastResetPeriod = subscription?.last_reset_at
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit" }).format(new Date(subscription.last_reset_at))
      : null;
    const used = lastResetPeriod === periodStart.slice(0, 7) ? Number(subscription?.design_count || 0) : 0;
    return NextResponse.json({
      requests: payload?.requests || [],
      quota: subscription ? {
        used,
        limit: quotaLimit(subscription.plan, subscription.design_quantity),
        period_start: periodStart,
      } : null,
    });
  } catch (error) {
    console.error("API Error [requests]:", error);
    return NextResponse.json({ error: "Could not load design requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await verifyUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const title = cleanText(body.title, 180);
    const description = cleanBrief(body.description);
    const category = ALLOWED_CATEGORIES.has(body.category) ? body.category : "other";
    const assetPaths = cleanAssetPaths(body.asset_paths, session.user.id);

    const result = await glashMaybeOne<{ result: { request: Record<string, unknown>; usage: { used: number; limit: number; period_start: string } } }>(
      "select public.submit_design_request_order($1::uuid,$2,$3,$4,$5::text[]) as result",
      [session.user.id, title, description, category, assetPaths],
    );
    if (!result?.result?.request) throw new Error("The design request could not be created.");

    const created = result.result.request;
    after(async () => {
      await notifyAdminFeatureEvent({
        permissionKeys: ["orders"],
        departmentNames: ["Design", "Creative"],
        title: "New design request",
        body: `${String(created.display_id || "A new order")} is ready to route into production.`,
        link: `/admin/orders/${created.id}`,
        teamLink: "/team/deliveries",
        eyebrow: "Client order",
        details: { Request: created.display_id, Category: category },
      });
    });
    return NextResponse.json(result.result, { status: 201 });
  } catch (error) {
    console.error("API Error [requests POST]:", error instanceof Error ? error.message : error);
    return errorResponse(error, "Could not submit the design request.");
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await verifyUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Missing request ID." }, { status: 400 });
    const result = await glashMaybeOne<{ deleted: boolean }>(
      "select public.release_design_request_order($1::uuid,$2::uuid) as deleted",
      [session.user.id, id],
    );
    if (!result?.deleted) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API Error [requests DELETE]:", error instanceof Error ? error.message : error);
    return errorResponse(error, "Could not delete the design request.");
  }
}
