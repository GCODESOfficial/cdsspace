/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-api-auth";
import { emailFrom, createEmailTransport } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { emailAttachmentsFor } from "@/lib/email-logo";

export const runtime = "nodejs";

/**
 * Sends the admin-reviewed email to the client. The admin edits the subject +
 * body in the UI and only this call actually dispatches it, so nothing goes out
 * until they click Send.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "consultations.manage");
  if (denied) return denied;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const subject = String(body?.subject || "").trim();
  const message = String(body?.body || "").trim();
  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }

  const sb: any = getSupabaseAdmin();
  const { data: consultation, error: loadErr } = await sb
    .from("consultation_requests")
    .select("email, full_name")
    .eq("id", id)
    .single();
  if (loadErr || !consultation?.email) {
    return NextResponse.json({ error: "Consultation or recipient email not found." }, { status: 404 });
  }

  const html = brandedEmailHtml(
    `<div style="color:#0D1B39;font-size:15px;line-height:1.65;">${message
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br/>")}</p>`)
      .join("")}</div>`,
  );

  try {
    const transporter = createEmailTransport();
    await transporter.sendMail({
      from: emailFrom("CDS Space"),
      to: consultation.email,
      subject,
      text: message,
      html,
      attachments: emailAttachmentsFor(html),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not send the email." }, { status: 500 });
  }

  const { data: updated } = await sb
    .from("consultation_requests")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  return NextResponse.json({ ok: true, consultation: updated });
}
