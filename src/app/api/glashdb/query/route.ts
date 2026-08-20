import { NextRequest, NextResponse } from "next/server";
import { executeGlashQueryPayload } from "@/lib/glashdb/query-server";
import type { GlashQueryPayload } from "@/lib/glashdb/query-core";
import { getAdminSession } from "@/lib/admin-session";
import { verifyUser } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClientScope = {
  column: string;
  value: (userId: string) => string;
  readOnly?: boolean;
  hiddenFromClients?: boolean;
};

const CLIENT_SCOPES: Record<string, ClientScope> = {
  profiles: { column: "id", value: (userId) => userId },
  user_legal_agreements: { column: "user_id", value: (userId) => userId, readOnly: true },
  subscriptions: { column: "user_id", value: (userId) => userId },
  design_requests: { column: "user_id", value: (userId) => userId },
  banner_requests: { column: "user_id", value: (userId) => userId },
  merch_orders: { column: "user_id", value: (userId) => userId },
  recurring_designs: { column: "user_id", value: (userId) => userId },
  booking_sessions: { column: "user_id", value: (userId) => userId },
  notifications: { column: "user_id", value: (userId) => userId, readOnly: true },
  finance_invoices: { column: "user_id", value: (userId) => userId, readOnly: true },
  finance_projects: { column: "user_id", value: (userId) => userId, readOnly: true },
  project_documents: { column: "client_user_id", value: (userId) => userId, readOnly: true },
  chat_messages: { column: "room_id", value: (userId) => `client_${userId}`, readOnly: true },
  finance_invoice_items: {
    column: "invoice_id",
    value: () => "",
    readOnly: true,
    hiddenFromClients: true,
  },
};

// Only marketing content deliberately rendered to signed-out visitors may be
// read through the generic browser query bridge. All other tables require an
// admin session or an explicitly scoped, OTP-gated client identity.
const PUBLIC_READ_TABLES = new Set([
  "advertisements",
  "brands",
  "faqs",
  "open_roles",
  "plan_pricing",
  "portfolio_designs",
  "testimonials",
  "work_images",
  "works",
]);

function errorResponse(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function scopeMutationPayload(payload: unknown, column: string, value: string) {
  const rows = Array.isArray(payload) ? payload : [payload];
  const scoped = rows.map((row) => ({
    ...(row && typeof row === "object" ? row : {}),
    [column]: value,
  }));
  return Array.isArray(payload) ? scoped : scoped[0];
}

function enforceClientScope(payload: GlashQueryPayload, scope: ClientScope, userId: string) {
  const value = scope.value(userId);
  const scoped: GlashQueryPayload = {
    ...payload,
    filters: [...(payload.filters || []), { op: "eq", column: scope.column, value }],
    orFilters: [...(payload.orFilters || [])],
  };

  if (payload.table === "project_documents") {
    scoped.filters = [...(scoped.filters || []), { op: "neq", column: "visibility", value: "internal" }];
  }

  if (payload.action === "insert" || payload.action === "upsert") {
    scoped.payload = scopeMutationPayload(payload.payload, scope.column, value);
  } else if (payload.action === "update" && payload.payload && typeof payload.payload === "object") {
    const patch = { ...(payload.payload as Record<string, unknown>) };
    delete patch[scope.column];
    scoped.payload = patch;
  }

  return scoped;
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null) as GlashQueryPayload | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ data: null, error: { message: "Invalid Glash query payload." } }, { status: 400 });
  }

  const admin = await getAdminSession();
  if (admin) {
    const result = await executeGlashQueryPayload(payload);
    return NextResponse.json(result, { status: result.error ? 400 : 200 });
  }

  if (payload.action === "rpc") {
    return errorResponse("Database functions are restricted to administrators.", 403);
  }

  const scope = payload.table ? CLIENT_SCOPES[payload.table] : undefined;
  const verified = scope ? await verifyUser() : null;

  if (!scope && (payload.action !== "select" || !payload.table || !PUBLIC_READ_TABLES.has(payload.table))) {
    return errorResponse("This database resource is not publicly accessible.", 403);
  }

  if (scope) {
    if (!verified) return errorResponse("Authentication is required for private client data.", 401);
    if (scope.hiddenFromClients) return errorResponse("This resource is available through its account API only.", 403);
    if (scope.readOnly && payload.action !== "select") {
      return errorResponse("This client resource is read-only.", 403);
    }

    const scopedPayload = enforceClientScope(payload, scope, verified.user.id);
    const result = await executeGlashQueryPayload(scopedPayload);
    return NextResponse.json(result, { status: result.error ? 400 : 200 });
  }

  const result = await executeGlashQueryPayload(payload);
  return NextResponse.json(result, { status: result.error ? 400 : 200 });
}
