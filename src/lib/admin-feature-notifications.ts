import "server-only";

import { brandedEmailHtml } from "@/lib/email-template";
import { createEmailTransport, sendEmail } from "@/lib/email-from";
import { glashQuery } from "@/lib/glashdb/postgres";
import { notifySuperAdmin } from "@/lib/notify-admin";

const SUPER_ADMIN_EMAIL = "contact.cdsspace@gmail.com";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");

export const ADMIN_FEATURE_PERMISSION_KEYS = {
  messages: ["messages", "messages.view", "messages.send", "messages.delete"],
  consultations: ["consultations", "consultations.view", "consultations.manage", "consultations.delete"],
  invoices: ["finance.manage", "finance_invoices", "finance_invoices.view", "finance_invoices.create", "finance_invoices.edit", "finance_invoices.mark_paid", "finance_invoices.send"],
  quotations: ["finance.manage", "finance_quotations", "finance_quotations.view", "finance_quotations.create", "finance_quotations.edit", "finance_quotations.convert", "finance_quotations.send"],
  clients: ["clients", "clients.view", "clients.create", "clients.edit"],
  orders: ["orders", "orders.view", "orders.update_status"],
  projects: ["projects", "projects.view", "projects.create", "projects.edit"],
  deliveries: ["deliveries", "deliveries.view", "deliveries.create", "deliveries.send"],
  mailings: ["clients", "clients.mailings.view", "clients.mailings.create", "clients.mailings.send"],
} as const;

interface AdminFeatureRecipient {
  id: string;
  full_name: string | null;
  email: string | null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function permissionRecipients(permissionKeys: readonly string[]) {
  const keys = [...new Set(["all", ...permissionKeys])];
  try {
    return await glashQuery<AdminFeatureRecipient>(
      `select distinct m.id, m.full_name, m.email
         from public.team_members m
         left join public.admin_roles r on r.id = m.role_id
        where m.is_active = true
          and m.is_sub_admin = true
          and m.email_verified_at is not null
          and (coalesce(m.permissions, '{}'::text[]) || coalesce(r.permissions, '{}'::text[])) && $1::text[]
        order by m.full_name`,
      [keys],
    );
  } catch {
    return glashQuery<AdminFeatureRecipient>(
      `select distinct m.id, m.full_name, m.email
         from public.team_members m
        where m.is_active = true
          and m.is_sub_admin = true
          and m.email_verified_at is not null
          and coalesce(m.permissions, '{}'::text[]) && $1::text[]
        order by m.full_name`,
      [keys],
    ).catch(() => []);
  }
}

function notificationHtml(input: {
  recipientName: string;
  title: string;
  body: string;
  eyebrow: string;
  absoluteLink: string;
  details: Record<string, unknown>;
}) {
  const detailRows = Object.entries(input.details)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .map(([label, value]) => `<tr>
      <td style="padding:9px 12px;border-bottom:1px solid #E8EDF5;color:#69738D;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #E8EDF5;color:#0D1B39;font-size:13px;font-weight:700;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`)
    .join("");
  return brandedEmailHtml(
    `<h1 style="margin:0 0 14px;color:#0D1B39;font-size:24px;line-height:1.25;">${escapeHtml(input.title)}</h1>
     <p style="margin:0 0 14px;">Hello ${escapeHtml(input.recipientName)},</p>
     <p style="margin:0 0 18px;">${escapeHtml(input.body)}</p>
     ${detailRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #E8EDF5;border-radius:12px;border-collapse:separate;border-spacing:0;overflow:hidden;background:#F8FAFD;">${detailRows}</table>` : ""}
     <a href="${escapeHtml(input.absoluteLink)}" style="display:inline-block;border-radius:10px;background:#0A4FE8;padding:12px 20px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;">Open in CDS Space</a>
     <p style="margin:22px 0 0;color:#69738D;font-size:12px;line-height:1.6;">You are receiving this update because your CDS Space admin role includes access to this business area.</p>`,
    { eyebrow: input.eyebrow, preheader: `${input.title}: ${input.body}`.slice(0, 180) },
  );
}

/** Permission-aware in-app and branded email delivery for critical admin events. */
export async function notifyAdminFeatureEvent(input: {
  permissionKeys: readonly string[];
  title: string;
  body: string;
  link: string;
  eyebrow: string;
  details?: Record<string, unknown>;
}) {
  try {
    const recipients = await permissionRecipients(input.permissionKeys);
    const absoluteLink = `${SITE_URL}${input.link.startsWith("/") ? input.link : `/${input.link}`}`;

    if (recipients.length) {
      await glashQuery(
        `insert into public.team_notifications
          (recipient_id, kind, title, body, link, actor_is_admin)
         select recipient_id, 'admin_feature_activity', $2, $3, $4, true
           from unnest($1::uuid[]) recipient_id`,
        [recipients.map((recipient) => recipient.id), input.title, input.body, input.link],
      ).catch(() => []);
    }

    await notifySuperAdmin({
      type: "status_change",
      title: input.title,
      message: input.body,
      link: input.link,
    });

    const emailRecipients = new Map<string, string>();
    emailRecipients.set(SUPER_ADMIN_EMAIL, "CDS Space Admin");
    for (const recipient of recipients) {
      const email = validEmail(recipient.email);
      if (email && !emailRecipients.has(email)) emailRecipients.set(email, recipient.full_name || "team member");
    }

    const transporter = createEmailTransport();
    try {
      const results = await Promise.allSettled(Array.from(emailRecipients.entries()).map(([email, name]) => sendEmail({
        to: email,
        subject: input.title,
        text: `${input.title}\n\n${input.body}\n\n${absoluteLink}`,
        html: notificationHtml({
          recipientName: name,
          title: input.title,
          body: input.body,
          eyebrow: input.eyebrow,
          absoluteLink,
          details: input.details || {},
        }),
        transporter,
      })));
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed) console.error(`[admin-feature-notifications] ${failed} email delivery attempt(s) failed.`);
    } finally {
      transporter.close();
    }
  } catch (error) {
    console.error("[admin-feature-notifications] delivery failed:", error);
  }
}

export function criticalActivityNotification(input: {
  action: string;
  resource_id?: string | null;
  resource_label?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const label = input.resource_label || input.resource_id || "Business activity";
  const eventByAction: Record<string, { permissionKeys: readonly string[]; title: string; body: string; link: string; eyebrow: string }> = {
    "invoice.create": { permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.invoices, title: "Invoice created", body: `${label} was created.`, link: "/admin/finance/invoices", eyebrow: "Finance · Invoices" },
    "invoice.payment_confirmed": { permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.invoices, title: "Invoice payment confirmed", body: `${label} has a confirmed payment.`, link: "/admin/finance/invoices", eyebrow: "Finance · Payments" },
    "quotation.create": { permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.quotations, title: "Quotation created", body: `${label} was created.`, link: "/admin/finance/quotations", eyebrow: "Finance · Quotations" },
    "quotation.convert": { permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.invoices, title: "Quotation converted", body: `${label} was converted into an invoice.`, link: "/admin/finance/invoices", eyebrow: "Finance · Invoices" },
    "project.create": { permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.projects, title: "Project created", body: `${label} was created.`, link: "/admin/projects", eyebrow: "Projects" },
    "delivery.sent_to_client": { permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.deliveries, title: "Client delivery sent", body: `${label} was released to the client.`, link: "/admin/clients/deliveries", eyebrow: "Sales Hub · Deliveries" },
    "client.create": { permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.clients, title: "Client added", body: `${label} was added to the client directory.`, link: "/admin/clients/list", eyebrow: "Sales Hub · Clients" },
    "client.invite": { permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.clients, title: "Client account invitation sent", body: `${label} was invited to create a client account.`, link: "/admin/clients/list", eyebrow: "Sales Hub · Clients" },
  };
  const event = eventByAction[input.action];
  return event ? { ...event, details: input.metadata || {} } : null;
}
