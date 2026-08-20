import { NextRequest, NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashQuery } from "@/lib/glashdb/postgres";
import { listPublishedPosts } from "@/lib/blog/queries";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchGroup =
  | "Intelligence"
  | "Brand workspace"
  | "Orders"
  | "Invoices"
  | "Documents"
  | "Messages";

export interface ClientSearchResult {
  id: string;
  group: SearchGroup;
  title: string;
  description: string;
  href: string;
}

type RecordRow = Record<string, unknown>;

function plainText(value: unknown, maxLength = 150) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function includesQuery(query: string, ...values: unknown[]) {
  return values.some((value) => plainText(value, 1000).toLowerCase().includes(query));
}

function relevance(query: string, title: unknown, ...supporting: unknown[]) {
  const normalizedTitle = plainText(title, 1000).toLowerCase();
  if (normalizedTitle === query) return 0;
  if (normalizedTitle.startsWith(query)) return 1;
  if (normalizedTitle.includes(query)) return 2;
  return supporting.some((value) => plainText(value, 1000).toLowerCase().includes(query)) ? 3 : 4;
}

async function safeRows(query: PromiseLike<{ data?: unknown[] | null; error?: unknown }>) {
  try {
    const result = await query;
    return result.error ? [] : (result.data || []) as RecordRow[];
  } catch {
    return [];
  }
}

async function searchIntelligence(userId: string, query: string): Promise<ClientSearchResult[]> {
  try {
    const pattern = `%${query}%`;
    const posts = await glashQuery<RecordRow>(
      `select bp.id, bp.slug, bp.title, bp.excerpt, bp.category, bp.publication_type, bp.published_at
       from public.blog_posts bp
       where bp.deleted_at is null
         and (
           (bp.access_level = 'public' and (bp.status = 'published' or (bp.status = 'scheduled' and bp.published_at <= now())))
           or (bp.access_level = 'account' and bp.status = 'published')
           or (bp.access_level = 'private_client' and bp.assigned_client_id = $1::uuid
               and (bp.access_expires_at is null or bp.access_expires_at > now()))
         )
         and (bp.title ilike $2 or coalesce(bp.excerpt, '') ilike $2 or coalesce(bp.category, '') ilike $2
              or coalesce(bp.publication_type, '') ilike $2)
       order by (bp.access_level = 'private_client') desc, coalesce(bp.published_at, bp.updated_at) desc
       limit 12`,
      [userId, pattern],
    );

    return posts.map((post) => ({
      id: `intelligence:${post.id}`,
      group: "Intelligence",
      title: plainText(post.title) || "Untitled publication",
      description: plainText(post.excerpt) || [post.publication_type, post.category].filter(Boolean).join(" · "),
      href: `/intelligence/${encodeURIComponent(String(post.slug || ""))}`,
    }));
  } catch (error) {
    if (!/column .* does not exist|relation .* does not exist/i.test(error instanceof Error ? error.message : String(error))) {
      return [];
    }
    const posts = await listPublishedPosts().catch(() => []);
    return posts
      .filter((post) => includesQuery(query, post.title, post.excerpt, post.category, post.publication_type))
      .sort((a, b) => relevance(query, a.title, a.excerpt) - relevance(query, b.title, b.excerpt))
      .slice(0, 12)
      .map((post) => ({
        id: `intelligence:${post.id}`,
        group: "Intelligence" as const,
        title: plainText(post.title) || "Untitled publication",
        description: plainText(post.excerpt) || [post.publication_type, post.category].filter(Boolean).join(" · "),
        href: `/intelligence/${encodeURIComponent(post.slug)}`,
      }));
  }
}

export async function GET(request: NextRequest) {
  const account = await getClientAccountState().catch(() => null);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!account.agreement) return NextResponse.json({ error: "Agreement required" }, { status: 403 });

  const limit = checkIntelligenceRateLimit(`client-search:${account.user.id}`, 90, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many searches. Please try again shortly." }, { status: 429 });
  }

  const query = plainText(request.nextUrl.searchParams.get("q"), 80).toLowerCase();
  if (query.length < 2) return NextResponse.json({ results: [], query });

  const db = getGlashDbAdmin() as any;
  const userId = account.user.id;
  const roomId = `client_${userId}`;

  const [intelligence, briefs, identities, designOrders, bannerOrders, merchOrders, recurringOrders, invoices, documents, messages] = await Promise.all([
    searchIntelligence(userId, query),
    safeRows(db.from("brand_briefs").select("id, brand_name, brand_tagline, industry, brand_description, status, updated_at").eq("client_user_id", userId).limit(20)),
    safeRows(db.from("brand_identity_deliveries").select("id, title, description, public_token, published_at").eq("user_id", userId).eq("is_public", true).limit(30)),
    safeRows(db.from("design_requests").select("id, title, status, created_at").eq("user_id", userId).limit(50)),
    safeRows(db.from("banner_requests").select("id, title, status, created_at").eq("user_id", userId).limit(50)),
    safeRows(db.from("merch_orders").select("id, title, status, created_at").eq("user_id", userId).limit(50)),
    safeRows(db.from("recurring_designs").select("id, title, status, created_at").eq("user_id", userId).limit(50)),
    safeRows(db.from("finance_invoices").select("id, invoice_number, total, currency, status, issue_date, due_date, public_token").eq("user_id", userId).limit(60)),
    safeRows(db.from("project_documents").select("id, title, description, kind, created_at").eq("client_user_id", userId).neq("visibility", "internal").limit(60)),
    safeRows(db.from("chat_messages").select("id, message, sender_role, created_at").eq("room_id", roomId).limit(60)),
  ]);

  const results: ClientSearchResult[] = [...intelligence];

  for (const brief of briefs) {
    if (!includesQuery(query, brief.brand_name, brief.brand_tagline, brief.industry, brief.brand_description, brief.status)) continue;
    results.push({
      id: `brief:${brief.id}`,
      group: "Brand workspace",
      title: plainText(brief.brand_name) || "Brand brief",
      description: plainText(brief.brand_description) || [brief.industry, brief.status].filter(Boolean).join(" · "),
      href: "/dashboard/brand-brief",
    });
  }

  for (const identity of identities) {
    if (!identity.published_at) continue;
    if (!includesQuery(query, identity.title, identity.description)) continue;
    results.push({
      id: `identity:${identity.id}`,
      group: "Brand workspace",
      title: plainText(identity.title) || "Brand identity delivery",
      description: plainText(identity.description) || "Completed brand identity delivery",
      href: "/dashboard/brand-identity",
    });
  }

  const orderSources = [
    ["Design", designOrders],
    ["Banner", bannerOrders],
    ["Merch", merchOrders],
    ["Recurring", recurringOrders],
  ] as const;
  for (const [kind, rows] of orderSources) {
    for (const order of rows) {
      if (!includesQuery(query, order.title, order.status, kind)) continue;
      results.push({
        id: `order:${kind}:${order.id}`,
        group: "Orders",
        title: plainText(order.title) || `${kind} order`,
        description: `${kind} · ${plainText(order.status) || "Order"}`,
        href: "/dashboard/orders",
      });
    }
  }

  for (const invoice of invoices) {
    if (!includesQuery(query, invoice.invoice_number, invoice.status, invoice.currency, invoice.total)) continue;
    const amount = invoice.currency && invoice.total != null ? `${invoice.currency} ${invoice.total}` : "";
    results.push({
      id: `invoice:${invoice.id}`,
      group: "Invoices",
      title: `Invoice ${plainText(invoice.invoice_number) || ""}`.trim(),
      description: [amount, plainText(invoice.status)].filter(Boolean).join(" · "),
      href: "/dashboard/invoices",
    });
  }

  for (const document of documents) {
    if (!includesQuery(query, document.title, document.description, document.kind)) continue;
    results.push({
      id: `document:${document.id}`,
      group: "Documents",
      title: plainText(document.title) || "Project document",
      description: plainText(document.description) || plainText(document.kind) || "Client document",
      href: "/dashboard/documents",
    });
  }

  for (const message of messages) {
    if (!includesQuery(query, message.message, message.sender_role)) continue;
    results.push({
      id: `message:${message.id}`,
      group: "Messages",
      title: plainText(message.message, 90) || "Shared attachment",
      description: `${plainText(message.sender_role) || "Conversation"} message`,
      href: "/dashboard/messages",
    });
  }

  const sorted = results
    .sort((a, b) => relevance(query, a.title, a.description) - relevance(query, b.title, b.description))
    .slice(0, 30);

  return NextResponse.json({ results: sorted, query }, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-RateLimit-Remaining": String(limit.remaining),
    },
  });
}
