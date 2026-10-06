import { NextRequest } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { adminMobileJson } from "@/lib/admin-mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Table access for the app's admin pages whose web versions query the database
 * straight from the browser (FAQs, testimonials, works, HRM roles, ...). Each
 * table names the permission each operation needs (any one of the listed keys)
 * and the columns that are never returned. Only plain column selects and
 * equality filters are accepted, so no other table can be reached through it.
 *
 *   GET    ?select=a,b&order=col.desc&limit=50&eq.status=open
 *   POST   { row } | { rows: [...] }            → inserted rows
 *   PATCH  ?eq.id=<id>   { patch }               → updated rows
 *   DELETE ?eq.id=<id>
 */

type Op = "read" | "insert" | "update" | "delete";
type TableRule = Partial<Record<Op, string[]>> & { hidden?: string[] };

const FINANCE_READ = ["finance", "finance.view", "projects", "projects.view", "finance_audit"];
const HRM_READ = ["hrm", "applicants.view", "team_members", "team_members.view"];
const ROLES_MANAGE = ["applicants.manage_openings", "hrm"];

const TABLES: Record<string, TableRule> = {
  faqs: { read: ["dashboard", "faqs", "faqs.view"], insert: ["faqs.create"], update: ["faqs.edit"], delete: ["faqs.delete"] },
  testimonials: {
    read: ["testimonials", "testimonials.view", "clients"],
    insert: ["testimonials.create"],
    update: ["testimonials.edit"],
    delete: ["testimonials.delete"],
  },
  works: {
    read: ["dashboard", "upload_works", "upload_works.view"],
    insert: ["upload_works.create"],
    update: ["upload_works.edit", "upload_works.assign"],
    delete: ["upload_works.delete"],
  },
  work_images: {
    read: ["dashboard", "upload_works", "upload_works.view"],
    insert: ["upload_works.create", "upload_works.edit"],
    update: ["upload_works.edit"],
    delete: ["upload_works.edit", "upload_works.delete"],
  },
  portfolio_designs: {
    read: ["portfolio", "portfolio.view"],
    insert: ["portfolio.upload"],
    update: ["portfolio.edit"],
    delete: ["portfolio.delete"],
  },
  design_requests: { read: ["clients", "clients.view", "dashboard"] },
  finance_projects: { read: FINANCE_READ },
  finance_contractors: { read: FINANCE_READ },
  finance_contractor_payments: { read: FINANCE_READ },
  finance_employees: { read: ["finance", "finance.view", "finance_payroll", "finance_audit"], hidden: ["bank_account_number"] },
  finance_expenditures: { read: ["finance", "finance.view", "finance_expenditures", "finance_audit"] },
  finance_inflows: { read: FINANCE_READ },
  finance_invoices: { read: ["finance", "finance.view", "finance_invoices", "finance_audit"] },
  sub_admins: {
    read: ["team_members.promote", "hrm", "sub_admins", "sub_admins.view"],
    update: ["team_members.promote", "sub_admins.edit"],
    delete: ["team_members.promote", "sub_admins.delete"],
    hidden: ["password"],
  },
  team_members: { read: ["team_members.promote", "team_members", "team_members.view", "hrm"], hidden: ["password_hash", "password_salt", "session_token", "session_expires_at"] },
  applications: { read: HRM_READ, update: ["applicants.update_status", "applicants.archive"], delete: ["applicants.delete"] },
  open_roles: { read: [...HRM_READ, "applicants.screening"], insert: ROLES_MANAGE, update: ROLES_MANAGE, delete: ROLES_MANAGE },
  role_applications: { read: HRM_READ, update: ["applicants.update_status", ...ROLES_MANAGE], delete: ["applicants.delete"] },
  cert_requests: {
    read: HRM_READ,
    update: ["applicants.manage_certifications", "hrm"],
    delete: ["applicants.manage_certifications", "hrm"],
  },
  clients: { read: ["clients", "clients.view", "finance_invoices", "finance_quotations", "projects"] },
};

const IDENT = /^[a-z_][a-z0-9_]*$/;

function fail(error: string, status: number) {
  return adminMobileJson({ ok: false, error }, status);
}

async function authorize(req: NextRequest, table: string, op: Op) {
  const rule = TABLES[table];
  if (!rule) return { error: fail("Unknown table", 404) };
  const keys = rule[op];
  if (!keys) return { error: fail("Not allowed", 405) };
  const session = await getAdminSessionAsync(req);
  if (!session) return { error: fail("Unauthorized", 401) };
  if (session.role !== "super_admin" && !keys.some((key) => hasPermission(session.permissions, key))) {
    return { error: fail("Forbidden", 403) };
  }
  return { rule, session };
}

const strip = (rows: Record<string, unknown>[] | null, hidden: string[] = []) =>
  (rows || []).map((row) => {
    if (!hidden.length) return row;
    const copy = { ...row };
    for (const key of hidden) delete copy[key];
    return copy;
  });

// Equality filters from ?eq.<column>=<value> (repeat a column for "in").
function filters(req: NextRequest) {
  const out: [string, string[]][] = [];
  const grouped = new Map<string, string[]>();
  req.nextUrl.searchParams.forEach((value, key) => {
    if (!key.startsWith("eq.")) return;
    const column = key.slice(3);
    if (!IDENT.test(column)) return;
    grouped.set(column, [...(grouped.get(column) || []), value]);
  });
  grouped.forEach((values, column) => out.push([column, values]));
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, list: [string, string[]][]) {
  let q = query;
  for (const [column, values] of list) q = values.length > 1 ? q.in(column, values) : q.eq(column, values[0]);
  return q;
}

// Writes may not touch hidden columns.
function cleanRow(row: unknown, hidden: string[] = []) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    if (IDENT.test(key) && !hidden.includes(key)) out[key] = value;
  }
  return out;
}

type Ctx = { params: Promise<{ table: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { table } = await params;
  const auth = await authorize(req, table, "read");
  if (auth.error) return auth.error;
  const select = req.nextUrl.searchParams.get("select") || "*";
  if (!/^[a-z0-9_,*]+$/.test(select)) return fail("Invalid select", 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = getSupabaseAdmin();
  let query = applyFilters(sb.from(table).select(select), filters(req));
  const order = req.nextUrl.searchParams.get("order");
  if (order) {
    for (const part of order.split(",")) {
      const [column, dir] = part.split(".");
      if (IDENT.test(column)) query = query.order(column, { ascending: dir !== "desc" });
    }
  }
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 500, 2000);
  query = query.limit(limit);
  const { data, error } = await query;
  if (error) return fail(error.message || "Could not load", 500);
  return adminMobileJson({ ok: true, rows: strip(data, auth.rule.hidden) });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { table } = await params;
  const auth = await authorize(req, table, "insert");
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as { row?: unknown; rows?: unknown[] } | null;
  const rows = (Array.isArray(body?.rows) ? body.rows : [body?.row]).map((r) => cleanRow(r, auth.rule.hidden)).filter(Boolean);
  if (!rows.length) return fail("Nothing to insert", 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = getSupabaseAdmin();
  const { data, error } = await sb.from(table).insert(rows).select();
  if (error) return fail(error.message || "Could not save", 500);
  return adminMobileJson({ ok: true, rows: strip(data, auth.rule.hidden) });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { table } = await params;
  const auth = await authorize(req, table, "update");
  if (auth.error) return auth.error;
  const where = filters(req);
  if (!where.length) return fail("A filter is required", 400);
  const body = (await req.json().catch(() => null)) as { patch?: unknown } | null;
  const patch = cleanRow(body?.patch, auth.rule.hidden);
  if (!patch || !Object.keys(patch).length) return fail("Nothing to update", 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = getSupabaseAdmin();
  const { data, error } = await applyFilters(sb.from(table).update(patch), where).select();
  if (error) return fail(error.message || "Could not save", 500);
  return adminMobileJson({ ok: true, rows: strip(data, auth.rule.hidden) });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { table } = await params;
  const auth = await authorize(req, table, "delete");
  if (auth.error) return auth.error;
  const where = filters(req);
  if (!where.length) return fail("A filter is required", 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = getSupabaseAdmin();
  const { error } = await applyFilters(sb.from(table).delete(), where);
  if (error) return fail(error.message || "Could not delete", 500);
  return adminMobileJson({ ok: true });
}
