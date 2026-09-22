import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { formatMoney } from "@/lib/finance/types";
import { invoiceBankDetailsText } from "@/lib/finance/share";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://cdsspace.pro";

interface InvoiceEmailItem {
  name: string | null;
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  total: number | string | null;
  position: number | null;
}

/** A branded pill CTA button for the email body. */
function cta(href: string, label: string) {
  return `<p style="text-align:center;margin:24px 0;"><a href="${href}" style="display:inline-block;background:#0A4FE8;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;">${label}</a></p>`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "Not set";
  const parsed = new Date(`${text.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? text
    : parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Email a shareable finance document to a recipient, straight from the admin
 * dashboard. Body: { kind: "invoice" | "quotation" | "pricelist", id, to? }.
 * For invoices/quotations `to` defaults to the stored client_email; pricelists
 * have no client, so `to` is required.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind = String(body?.kind || "");
  const id = String(body?.id || "");
  const toOverride = body?.to ? String(body.to).trim() : "";

  // Emailing a document requires the granular "Send by Email" permission for
  // that document kind (super-admins and finance.manage are covered by hasPermission).
  const sendPermission =
    kind === "invoice" ? "finance_invoices.send"
    : kind === "quotation" ? "finance_quotations.send"
    : kind === "pricelist" ? "finance_pricelists.send"
    : "finance";
  const denied = await requireFinanceAdminAsync(req, sendPermission);
  if (denied) return denied;

  if (!id) return NextResponse.json({ error: "Missing document id" }, { status: 400 });

  const sb = financeDb();

  try {
    if (kind === "invoice") {
      const { data: inv, error: invoiceError } = await sb
        .from("finance_invoices")
        .select("invoice_number, client_name, client_email, client_address, subtotal, tax_rate, tax_amount, discount, total, currency, issue_date, due_date, notes, payment_terms, status, public_token")
        .eq("id", id)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      if (inv.status === "cancelled") {
        return NextResponse.json({ error: "A cancelled invoice cannot be sent." }, { status: 409 });
      }

      const { data: items, error: itemsError } = await sb
        .from("finance_invoice_items")
        .select("name, description, quantity, unit_price, total, position")
        .eq("invoice_id", id)
        .order("position");
      if (itemsError) throw itemsError;

      const to = toOverride || inv.client_email;
      if (!to) return NextResponse.json({ error: "No recipient - add a client email or provide one." }, { status: 400 });
      const validItems = ((items ?? []) as InvoiceEmailItem[]).filter((item) => String(item.name || "").trim() && Number(item.quantity) > 0);
      if (!String(inv.client_name || "").trim() || validItems.length === 0 || Number(inv.total) <= 0) {
        return NextResponse.json(
          { error: "Complete and save the client, line items, and a positive total before sending this invoice." },
          { status: 409 },
        );
      }

      const url = `${SITE_URL}/invoice/${inv.public_token}`;
      const itemRows = validItems.map((item) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #E8EDF5;color:#0D1B39;vertical-align:top;">
            <strong>${escapeHtml(item.name)}</strong>
            ${item.description ? `<br><span style="font-size:12px;color:#69738D;">${escapeHtml(item.description)}</span>` : ""}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #E8EDF5;text-align:center;color:#475569;vertical-align:top;">${escapeHtml(item.quantity)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #E8EDF5;text-align:right;color:#475569;vertical-align:top;">${escapeHtml(formatMoney(item.unit_price, inv.currency))}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #E8EDF5;text-align:right;color:#0D1B39;font-weight:700;vertical-align:top;">${escapeHtml(formatMoney(item.total, inv.currency))}</td>
        </tr>`).join("");
      const discountRow = Number(inv.discount) > 0
        ? `<tr><td style="padding:5px 0;color:#69738D;">Discount</td><td style="padding:5px 0;text-align:right;color:#0D1B39;">-${escapeHtml(formatMoney(inv.discount, inv.currency))}</td></tr>`
        : "";
      const taxRow = Number(inv.tax_amount) > 0
        ? `<tr><td style="padding:5px 0;color:#69738D;">Tax (${escapeHtml(inv.tax_rate)}%)</td><td style="padding:5px 0;text-align:right;color:#0D1B39;">${escapeHtml(formatMoney(inv.tax_amount, inv.currency))}</td></tr>`
        : "";
      const html = brandedEmailHtml(
        `
        <h2 style="margin:0 0 12px;color:#0D1B39;">Invoice ${escapeHtml(inv.invoice_number)}</h2>
        <p>Hi ${escapeHtml(inv.client_name || "there")},</p>
        <p>Please find the completed invoice details below.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid #E8EDF5;border-radius:12px;border-collapse:separate;border-spacing:0;overflow:hidden;background:#F8FAFD;">
          <tr>
            <td style="padding:12px;color:#69738D;font-size:13px;vertical-align:top;">Issued<br><strong style="color:#0D1B39;">${escapeHtml(formatDate(inv.issue_date))}</strong></td>
            <td style="padding:12px;color:#69738D;font-size:13px;vertical-align:top;">Due<br><strong style="color:#0D1B39;">${escapeHtml(formatDate(inv.due_date))}</strong></td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0 12px 12px;color:#69738D;font-size:13px;vertical-align:top;">Bill to<br><strong style="color:#0D1B39;">${escapeHtml(inv.client_name)}</strong>${inv.client_address ? `<br>${escapeHtml(inv.client_address)}` : ""}</td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#F1F5F9;color:#475569;"><th style="padding:9px 8px;text-align:left;">Item</th><th style="padding:9px 8px;text-align:center;">Qty</th><th style="padding:9px 8px;text-align:right;">Rate</th><th style="padding:9px 8px;text-align:right;">Amount</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:13px;">
          <tr><td style="padding:5px 0;color:#69738D;">Subtotal</td><td style="padding:5px 0;text-align:right;color:#0D1B39;">${escapeHtml(formatMoney(inv.subtotal, inv.currency))}</td></tr>
          ${discountRow}${taxRow}
          <tr><td style="padding:9px 0 0;color:#0D1B39;font-size:16px;font-weight:700;border-top:1px solid #E8EDF5;">Total</td><td style="padding:9px 0 0;text-align:right;color:#0D1B39;font-size:16px;font-weight:700;border-top:1px solid #E8EDF5;">${escapeHtml(formatMoney(inv.total, inv.currency))}</td></tr>
        </table>
        ${inv.notes ? `<p style="font-size:13px;color:#475569;"><strong>Notes:</strong><br>${escapeHtml(inv.notes)}</p>` : ""}
        ${inv.payment_terms ? `<p style="font-size:13px;color:#475569;"><strong>Payment terms:</strong><br>${escapeHtml(inv.payment_terms)}</p>` : ""}
        ${cta(url, "View invoice")}
        <p style="font-size:13px;color:#6b7280;margin-bottom:6px;">Bank transfer details:</p>
        <pre style="font-size:13px;color:#374151;background:#f8fafc;padding:12px;border-radius:8px;white-space:pre-wrap;font-family:inherit;margin:0;">${escapeHtml(invoiceBankDetailsText())}</pre>
      `,
        { eyebrow: "Invoice", preheader: `Invoice ${inv.invoice_number} - ${formatMoney(inv.total, inv.currency)}` },
      );
      await sendEmail({ to, subject: `Invoice ${inv.invoice_number} from CDS Space`, html });
      if (inv.status === "draft") {
        const { error: statusError } = await sb.from("finance_invoices").update({ status: "sent" }).eq("id", id);
        if (statusError) console.error("[finance/share] invoice email sent but status update failed:", statusError.message);
      }
      await logActivity({
        action: "invoice.email",
        page: "finance/invoices",
        resource_type: "invoice",
        resource_id: id,
        resource_label: `${inv.invoice_number} → ${to}`,
        metadata: { total: inv.total, currency: inv.currency, item_count: validItems.length },
      });
      return NextResponse.json({ ok: true, to, status: inv.status === "draft" ? "sent" : inv.status });
    }

    if (kind === "quotation") {
      const { data: q } = await sb
        .from("finance_quotations")
        .select("quotation_number, client_name, client_email, total, currency, public_token")
        .eq("id", id)
        .maybeSingle();
      if (!q) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
      const to = toOverride || q.client_email;
      if (!to) return NextResponse.json({ error: "No recipient - add a client email or provide one." }, { status: 400 });

      const url = `${SITE_URL}/quotation/${q.public_token}`;
      const html = brandedEmailHtml(
        `
        <h2 style="margin:0 0 12px;color:#0D1B39;">Quotation ${q.quotation_number}</h2>
        <p>Hi ${q.client_name || "there"},</p>
        <p>Here is your project quotation, estimated at <strong>${formatMoney(q.total, q.currency)}</strong>. This is a rough estimate for the work and is not a final invoice.</p>
        ${cta(url, "View quotation")}
      `,
        { eyebrow: "Quotation", preheader: `Quotation ${q.quotation_number} - ${formatMoney(q.total, q.currency)}` },
      );
      await sendEmail({ to, subject: `Quotation ${q.quotation_number} from CDS Space`, html });
      await logActivity({ action: "quotation.email", page: "finance/quotations", resource_type: "quotation", resource_id: id, resource_label: `${q.quotation_number} → ${to}` });
      return NextResponse.json({ ok: true, to });
    }

    if (kind === "pricelist") {
      if (!toOverride) return NextResponse.json({ error: "Recipient email is required for a pricelist." }, { status: 400 });
      const { data: pl } = await sb
        .from("pricing_lists")
        .select("slug, title")
        .eq("id", id)
        .maybeSingle();
      if (!pl) return NextResponse.json({ error: "Pricelist not found" }, { status: 404 });

      const url = `${SITE_URL}/pricing/${pl.slug}`;
      const html = brandedEmailHtml(
        `
        <h2 style="margin:0 0 12px;color:#0D1B39;">${pl.title || "Our Pricelist"}</h2>
        <p>Hi there,</p>
        <p>Here's our latest pricelist. Tap below to view it - it's mobile-friendly with a live currency toggle.</p>
        ${cta(url, "View pricelist")}
      `,
        { eyebrow: "Pricelist", preheader: pl.title || "CDS Space pricelist" },
      );
      await sendEmail({ to: toOverride, subject: `${pl.title || "CDS Space"} - Pricelist`, html });
      await logActivity({ action: "pricelist.email", page: "finance/pricelists", resource_type: "pricelist", resource_id: id, resource_label: `${pl.title || id} → ${toOverride}` });
      return NextResponse.json({ ok: true, to: toOverride });
    }

    return NextResponse.json({ error: "Unknown document kind" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to send" }, { status: 500 });
  }
}
