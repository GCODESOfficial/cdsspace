/**
 * Notification digest worker.
 *
 * Point a scheduler at GET /api/cron/notification-digest every ~30 min
 * (Authorization: Bearer CRON_SECRET). It flushes public.notification_email_queue,
 * grouping unsent items per recipient + category: a single item goes out as its
 * original email; multiple items compound into ONE branded digest email so a
 * burst of task/chat notifications no longer floods the inbox.
 */
import { NextRequest, NextResponse } from "next/server";
import { glashQuery } from "@/lib/glashdb/postgres";
import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueueRow {
  id: string; recipient_email: string; category: string; subject: string;
  title: string; body: string | null; link: string | null; html: string | null;
  text_body: string | null; from_name: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  tasks: "task updates",
  chat: "chat messages",
  deliveries: "delivery updates",
  content: "content updates",
  finance: "finance updates",
};

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

function escapeHtml(v: string) {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c] || c);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const rows = await glashQuery<QueueRow>(
    `select id, recipient_email, category, subject, title, body, link, html, text_body, from_name
       from public.notification_email_queue
      where sent_at is null
      order by recipient_email, category, created_at
      limit 2000`,
  );
  if (!rows.length) return NextResponse.json({ ok: true, groups: 0, emails: 0, items: 0 });

  // Group by recipient + category.
  const groups = new Map<string, QueueRow[]>();
  for (const row of rows) {
    const key = `${row.recipient_email}|${row.category}`;
    (groups.get(key) || groups.set(key, []).get(key)!).push(row);
  }

  let emails = 0;
  for (const [, items] of groups) {
    const first = items[0];
    const ids = items.map((i) => i.id);
    try {
      if (items.length === 1) {
        // Single item - send the original email untouched.
        await sendEmail({ to: first.recipient_email, subject: first.subject, html: first.html || undefined, text: first.text_body || undefined, fromName: first.from_name || "CDS Space" });
      } else {
        // Multiple - compound into one branded digest.
        const label = CATEGORY_LABEL[first.category] || `${first.category} updates`;
        const listItems = items.map((i) => {
          const title = escapeHtml(i.title || i.subject);
          const line = i.link ? `<a href="${escapeHtml(i.link)}" style="color:#0A4FE8;text-decoration:none;font-weight:600;">${title}</a>` : `<span style="font-weight:600;color:#0D1B39;">${title}</span>`;
          const sub = i.body ? `<div style="color:#667085;font-size:13px;margin-top:2px;">${escapeHtml(i.body)}</div>` : "";
          return `<li style="margin:0 0 12px 0;list-style:none;padding:12px 14px;border:1px solid #eef1f7;border-radius:10px;">${line}${sub}</li>`;
        }).join("");
        const bodyHtml = `
          <p style="margin:0 0 14px 0;">You have <strong>${items.length}</strong> new ${escapeHtml(label)} from the last day.</p>
          <ul style="margin:0;padding:0;">${listItems}</ul>
          <p style="margin:16px 0 0 0;color:#667085;font-size:12px;">These were grouped so your inbox stays tidy. Open the CDS Space dashboard to act on them.</p>`;
        await sendEmail({
          to: first.recipient_email,
          subject: `${items.length} ${label} - CDS Space`,
          html: brandedEmailHtml(bodyHtml, { eyebrow: label, preheader: `${items.length} ${label} in the last 24 hours.` }),
          text: `You have ${items.length} new ${label}:\n\n` + items.map((i) => `- ${i.title}${i.link ? ` ${i.link}` : ""}`).join("\n"),
          fromName: "CDS Space",
        });
      }
      await glashQuery(`update public.notification_email_queue set sent_at = now() where id = any($1::uuid[])`, [ids]);
      emails += 1;
    } catch (error) {
      console.error("[notification-digest] group send failed:", error);
    }
  }

  return NextResponse.json({ ok: true, groups: groups.size, emails, items: rows.length });
}
