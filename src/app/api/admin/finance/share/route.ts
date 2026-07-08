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

/** A branded pill CTA button for the email body. */
function cta(href: string, label: string) {
  return `<p style="text-align:center;margin:24px 0;"><a href="${href}" style="display:inline-block;background:linear-gradient(146deg,#0035C1,#0575FF);color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;">${label}</a></p>`;
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
      const { data: inv } = await sb
        .from("finance_invoices")
        .select("invoice_number, client_name, client_email, total, currency, public_token")
        .eq("id", id)
        .maybeSingle();
      if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      const to = toOverride || inv.client_email;
      if (!to) return NextResponse.json({ error: "No recipient - add a client email or provide one." }, { status: 400 });

      const url = `${SITE_URL}/invoice/${inv.public_token}`;
      const html = brandedEmailHtml(
        `
        <h2 style="margin:0 0 12px;color:#0D1B39;">Invoice ${inv.invoice_number}</h2>
        <p>Hi ${inv.client_name || "there"},</p>
        <p>Please find your invoice for <strong>${formatMoney(inv.total, inv.currency)}</strong>. You can view the full breakdown and payment details at the link below.</p>
        ${cta(url, "View invoice")}
        <p style="font-size:13px;color:#6b7280;margin-bottom:6px;">Bank transfer details:</p>
        <pre style="font-size:13px;color:#374151;background:#f8fafc;padding:12px;border-radius:8px;white-space:pre-wrap;font-family:inherit;margin:0;">${invoiceBankDetailsText()}</pre>
      `,
        { eyebrow: "Invoice", preheader: `Invoice ${inv.invoice_number} - ${formatMoney(inv.total, inv.currency)}` },
      );
      await sendEmail({ to, subject: `Invoice ${inv.invoice_number} from CDS Space`, html });
      await logActivity({ action: "invoice.email", page: "finance/invoices", resource_type: "invoice", resource_id: id, resource_label: `${inv.invoice_number} → ${to}` });
      return NextResponse.json({ ok: true, to });
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
