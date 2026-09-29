import "server-only";

import { glashQuery } from "@/lib/glashdb/postgres";
import { publicSiteOrigin } from "@/lib/public-site";

/**
 * Client data the web dashboard reads through the generic query bridge
 * (/api/glashdb/query). The app gets fixed endpoints instead, so it is not
 * coupled to table and column names. Same tables, filters and ordering as
 * the web pages.
 */

type Row = { id: string; title: string | null; status: string | null; created_at: string | null };

const ORDER_SOURCES = [
  { table: "design_requests", type: "Design" },
  { table: "banner_requests", type: "Banner" },
  { table: "merch_orders", type: "Merch" },
  { table: "recurring_designs", type: "Recurring" },
] as const;

export async function clientOrders(userId: string) {
  const groups = await Promise.all(
    ORDER_SOURCES.map(async ({ table, type }) => {
      const rows = await glashQuery<Row>(
        `select id, title, status, created_at from public.${table} where user_id = $1::uuid order by created_at desc`,
        [userId],
      );
      return rows.map((row) => ({ id: row.id, type, title: row.title, status: row.status, createdAt: row.created_at }));
    }),
  );
  return groups.flat().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  total: string | number | null;
  currency: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  public_token: string | null;
};

export async function clientInvoices(userId: string, limit?: number) {
  const rows = await glashQuery<InvoiceRow>(
    `select id, invoice_number, total, currency, status, issue_date, due_date, public_token
       from public.finance_invoices where user_id = $1::uuid
      order by issue_date desc nulls last ${limit ? "limit " + Math.max(1, Math.min(100, limit)) : ""}`,
    [userId],
  );
  const origin = publicSiteOrigin();
  return rows.map((row) => ({
    id: row.id,
    number: row.invoice_number,
    total: row.total == null ? null : Number(row.total),
    currency: row.currency,
    status: row.status,
    issuedAt: row.issue_date,
    dueAt: row.due_date,
    // Public, tokenised invoice page (view, receipt and payment).
    url: row.public_token ? `${origin}/invoice/${row.public_token}` : null,
  }));
}

export async function clientHome(userId: string) {
  const [designs, banners, invoices, messages] = await Promise.all([
    glashQuery<Row>(
      `select id, title, status, created_at from public.design_requests
        where user_id = $1::uuid and status <> 'COMPLETED' order by created_at desc limit 5`,
      [userId],
    ),
    glashQuery<Row>(
      `select id, title, status, created_at from public.banner_requests
        where user_id = $1::uuid and status <> 'COMPLETED' order by created_at desc limit 5`,
      [userId],
    ),
    clientInvoices(userId, 5),
    glashQuery<{ id: string; message: string | null; sender_role: string | null; created_at: string }>(
      `select id, message, sender_role, created_at from public.chat_messages
        where room_id = $1 order by created_at desc limit 5`,
      [`client_${userId}`],
    ),
  ]);
  const projects = [...designs.map((r) => ({ ...r, type: "Design" })), ...banners.map((r) => ({ ...r, type: "Banner" }))]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 5)
    .map((r) => ({ id: r.id, type: r.type, title: r.title, status: r.status, createdAt: r.created_at }));
  return {
    projects,
    invoices,
    messages: messages.map((m) => ({
      id: m.id,
      text: m.message,
      from: m.sender_role === "client" ? "me" : "team",
      at: m.created_at,
    })),
  };
}

export async function createClientBooking(
  userId: string,
  input: { fullName: string; email: string; phone?: string; topic: string; date: string; time?: string; duration?: number; notes?: string },
) {
  const rows = await glashQuery<{ id: string; created_at: string }>(
    `insert into public.booking_sessions
       (user_id, full_name, email, phone, topic, preferred_date, preferred_time, duration, notes)
     values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id, created_at`,
    [
      userId,
      input.fullName,
      input.email,
      input.phone || null,
      input.topic,
      input.date,
      input.time || null,
      input.duration ?? 30,
      input.notes || null,
    ],
  );
  return rows[0];
}
