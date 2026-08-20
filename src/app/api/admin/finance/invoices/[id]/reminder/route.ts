import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { financeDb } from "@/lib/finance/api-auth";
import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { absolutePublicUrl } from "@/lib/public-site";
import { logActivity } from "@/lib/activity-log";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${Number(amount || 0).toLocaleString("en")}`;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireAdmin(req, "finance_invoices.edit");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = financeDb();
  const { data: invoice, error } = await db
    .from("finance_invoices")
    .select("id, invoice_number, client_name, client_email, currency, total, status, due_date, public_token, user_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (!["sent", "overdue"].includes(String(invoice.status))) {
    return NextResponse.json({ error: "Payment reminders are available only for sent or overdue invoices awaiting payment." }, { status: 409 });
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recent } = await db
    .from("invoice_payment_reminders")
    .select("id, created_at")
    .eq("invoice_id", id)
    .gte("created_at", fiveMinutesAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    return NextResponse.json({ error: "A reminder was already sent for this invoice within the last five minutes." }, { status: 429 });
  }

  let clientUserId = invoice.user_id as string | null;
  let clientEmail = String(invoice.client_email || "").trim();
  if (clientUserId) {
    const { data: profile } = await db.from("profiles").select("id, email").eq("id", clientUserId).maybeSingle();
    clientEmail ||= String(profile?.email || "").trim();
  } else if (clientEmail) {
    const { data: profile } = await db.from("profiles").select("id, email").ilike("email", clientEmail).limit(1).maybeSingle();
    if (profile?.id) clientUserId = profile.id;
    if (!clientUserId) {
      const { data: crmClient } = await db.from("clients").select("platform_user_id").ilike("email", clientEmail).limit(1).maybeSingle();
      clientUserId = crmClient?.platform_user_id || null;
    }
  }

  const amount = money(Number(invoice.total || 0), String(invoice.currency || "NGN"));
  const invoiceUrl = absolutePublicUrl(`/invoice/${invoice.public_token}`);
  const dueLine = invoice.due_date
    ? ` It was due on ${new Date(`${invoice.due_date}T12:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.`
    : "";
  const message = `Hello ${invoice.client_name || "there"}, this is a friendly payment reminder for invoice ${invoice.invoice_number} (${amount}), which is still awaiting payment.${dueLine} Review the invoice or submit your bank-transfer confirmation here: ${invoiceUrl}`;

  let chatMessageId: string | null = null;
  let chatSentAt: string | null = null;
  if (clientUserId) {
    const { data: chatMessage, error: chatError } = await db
      .from("chat_messages")
      .insert({
        room_id: `client_${clientUserId}`,
        sender_id: null,
        sender_role: "admin",
        message,
        source: "web",
        message_type: "text",
        metadata: { kind: "invoice_payment_reminder", invoice_id: invoice.id, invoice_number: invoice.invoice_number },
      })
      .select("id, created_at")
      .single();
    if (!chatError && chatMessage) {
      chatMessageId = chatMessage.id;
      chatSentAt = chatMessage.created_at;
      await db.from("notifications").insert({
        user_id: clientUserId,
        type: "new_message",
        title: "Invoice payment reminder",
        message: `${invoice.invoice_number} for ${amount} is awaiting payment.`,
        link: "/dashboard/invoices",
        is_read: false,
      });
    }
  }

  let emailSentAt: string | null = null;
  let emailError: string | null = null;
  if (clientEmail) {
    try {
      const safeName = escapeHtml(invoice.client_name || "there");
      const safeNumber = escapeHtml(invoice.invoice_number);
      const safeAmount = escapeHtml(amount);
      const safeUrl = escapeHtml(invoiceUrl);
      await sendEmail({
        to: clientEmail,
        fromName: "CDS Space Accounts",
        subject: `Payment reminder: ${invoice.invoice_number}`,
        text: message,
        html: brandedEmailHtml(`
          <p>Hello ${safeName},</p>
          <p>This is a friendly reminder that <strong>${safeNumber}</strong> for <strong>${safeAmount}</strong> is still awaiting payment.</p>
          ${invoice.due_date ? `<p>The invoice due date is <strong>${escapeHtml(invoice.due_date)}</strong>.</p>` : ""}
          <p>You can review the invoice, choose a payment option, or submit your bank-transfer reference and receipt using the button below.</p>
          <p style="margin:24px 0;"><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#0A4FE8;color:#ffffff;text-decoration:none;font-weight:700;">Review invoice and pay</a></p>
          <p>If payment has already been made, please submit the confirmation on the invoice page so our team can verify it promptly.</p>
        `, { eyebrow: "Payment reminder", preheader: `${invoice.invoice_number} is awaiting payment.` }),
      });
      emailSentAt = new Date().toISOString();
    } catch (reason) {
      emailError = reason instanceof Error ? reason.message.slice(0, 1000) : "Email delivery failed.";
    }
  }

  const { data: reminder, error: reminderError } = await db
    .from("invoice_payment_reminders")
    .insert({
      invoice_id: invoice.id,
      client_user_id: clientUserId,
      sent_by: session.name || session.email,
      message,
      chat_message_id: chatMessageId,
      chat_sent_at: chatSentAt,
      email_to: clientEmail || null,
      email_sent_at: emailSentAt,
      email_error: emailError,
    })
    .select("id, created_at")
    .single();
  if (reminderError) return NextResponse.json({ error: reminderError.message }, { status: 500 });

  await logActivity({
    action: "invoice.payment_reminder",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: invoice.id,
    resource_label: `${invoice.invoice_number} · ${invoice.client_name || "Client"}`,
    metadata: { chat_sent: Boolean(chatMessageId), email_sent: Boolean(emailSentAt), email_to: clientEmail || null },
  });

  if (!chatMessageId && !emailSentAt) {
    return NextResponse.json({
      error: clientEmail || clientUserId
        ? `The reminder could not be delivered.${emailError ? ` Email error: ${emailError}` : ""}`
        : "This invoice is not linked to a client account or email address. Add one before sending a reminder.",
      reminder,
    }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    reminder,
    chat_sent: Boolean(chatMessageId),
    email_sent: Boolean(emailSentAt),
    email_to: clientEmail || null,
    warning: emailError || null,
  });
}
