import "server-only";

import { brandedEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-from";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { clientDashboardPath } from "@/lib/client-routes";
import { absolutePublicUrl } from "@/lib/public-site";
import { publicDeliveryPath } from "@/lib/delivery-links";

type DeliveryEmailRow = {
  id: string;
  title: string;
  description: string | null;
  delivery_type: "brand_identity" | "design";
  public_token: string;
  published_at: string | null;
  client_email: string | null;
  client_name: string | null;
  public_user_id: string | null;
  project_name: string | null;
  file_count: number;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readableType(value: DeliveryEmailRow["delivery_type"]) {
  return value === "brand_identity" ? "Brand identity" : "Design delivery";
}

export async function deliverClientDeliveryEmail(deliveryId: string) {
  const delivery = await glashMaybeOne<DeliveryEmailRow>(
    `select d.id, d.title, d.description, d.delivery_type, d.public_token::text,
            d.published_at,
            coalesce(p.email, c.email) as client_email,
            coalesce(p.full_name, p.company_name, c.name, c.brand_name) as client_name,
            p.public_user_id,
            fp.name as project_name,
            coalesce(files.file_count, 0)::int as file_count
       from public.client_deliveries d
       left join public.profiles p on p.id = d.client_user_id
       left join public.clients c on c.id = d.manual_client_id
       left join public.finance_projects fp on fp.id = d.project_id
       left join lateral (
         select count(*)::int as file_count
           from public.client_delivery_files f
          where f.delivery_id = d.id
       ) files on true
      where d.id = $1
        and d.status in ('published', 'awaiting_account')
      limit 1`,
    [deliveryId],
  );
  const recipient = delivery?.client_email?.trim().toLowerCase() || "";
  if (!delivery || !recipient) return { sent: false, skipped: true, error: null as string | null };

  const claimed = await glashMaybeOne<{ id: string }>(
    `update public.client_deliveries
        set delivery_email_attempted_at = now(), delivery_email_error = null, updated_at = now()
      where id = $1
        and delivery_email_sent_at is null
        and (delivery_email_attempted_at is null or delivery_email_attempted_at < now() - interval '5 minutes')
      returning id`,
    [delivery.id],
  );
  if (!claimed) return { sent: false, skipped: true, error: null as string | null };

  const workUrl = absolutePublicUrl(publicDeliveryPath(delivery.title, delivery.public_token));
  const documentsPath = delivery.public_user_id
    ? clientDashboardPath(delivery.public_user_id, "/dashboard/documents")
    : "/dashboard/documents";
  const loginUrl = absolutePublicUrl(`/login?next=${encodeURIComponent(documentsPath)}`);
  const firstName = delivery.client_name?.trim().split(/\s+/)[0] || "there";
  const deliveredDate = new Date(delivery.published_at || Date.now()).toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const detailRows = [
    ["Delivery", readableType(delivery.delivery_type)],
    delivery.project_name ? ["Project", delivery.project_name] : null,
    ["Files", `${delivery.file_count} ${delivery.file_count === 1 ? "file" : "files"}`],
    ["Delivered", deliveredDate],
  ].filter(Boolean) as string[][];
  const detailsHtml = detailRows.map(([label, value]) => `
    <tr>
      <td style="padding:9px 12px;color:#69738D;font-size:13px;border-bottom:1px solid #E8EDF5;">${escapeHtml(label)}</td>
      <td style="padding:9px 12px;color:#0D1B39;font-size:13px;font-weight:700;border-bottom:1px solid #E8EDF5;">${escapeHtml(value)}</td>
    </tr>`).join("");
  const description = delivery.description
    ? `<p style="margin:0 0 20px;color:#556078;">${escapeHtml(delivery.description).replace(/\n/g, "<br/>")}</p>`
    : "";
  const html = brandedEmailHtml(`
    <h1 style="margin:0 0 10px;color:#0D1B39;font-size:24px;line-height:1.25;">Your finished work is ready</h1>
    <p style="margin:0 0 18px;">Hello ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 18px;">We have completed <strong>${escapeHtml(delivery.title)}</strong> and made the finished project available to you.</p>
    ${description}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #E8EDF5;border-radius:12px;overflow:hidden;">${detailsHtml}</table>
    <p style="margin:0 0 14px;">
      <a href="${workUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0A4FE8;color:#FFFFFF;text-decoration:none;font-weight:700;">View finished project</a>
    </p>
    <p style="margin:0;color:#69738D;font-size:13px;">You can also <a href="${loginUrl}" style="color:#0A4FE8;font-weight:700;">sign in to your CDS Space dashboard</a> and find this delivery under Documents.</p>
  `, {
    eyebrow: "Completed client delivery",
    preheader: `${delivery.title} is ready to view in your CDS Space account.`,
  });
  const text = [
    `Hello ${firstName},`,
    "",
    `Your finished work, ${delivery.title}, is ready.`,
    delivery.description || "",
    `View finished project: ${workUrl}`,
    `Sign in to your dashboard: ${loginUrl}`,
  ].filter(Boolean).join("\n");

  try {
    await sendEmail({
      to: recipient,
      subject: `${delivery.title} is ready | CDS Space`,
      html,
      text,
    });
    await glashQuery(
      `update public.client_deliveries
          set delivery_email_sent_at = now(), delivery_email_error = null, updated_at = now()
        where id = $1`,
      [delivery.id],
    );
    return { sent: true, skipped: false, error: null as string | null };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 1000);
    await glashQuery(
      `update public.client_deliveries
          set delivery_email_error = $2, updated_at = now()
        where id = $1`,
      [delivery.id, message],
    );
    console.error("[client-delivery-email] delivery failed", { deliveryId: delivery.id, message });
    return { sent: false, skipped: false, error: message };
  }
}
