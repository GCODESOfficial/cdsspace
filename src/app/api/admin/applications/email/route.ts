import { NextRequest, NextResponse } from "next/server";
import { sendEmail, verifyEmailReady, createEmailTransport } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function canManage(session: AdminSession) {
  return session.role === "super_admin" || hasPermission(session.permissions, "applicants.email");
}

interface Recipient {
  id: string;
  full_name: string;
  email: string;
  role_title: string | null;
}

/** Replace {{name}} / {{first_name}} / {{role}} tokens for a single recipient. */
function personalise(template: string, r: Recipient) {
  const first = (r.full_name || "").trim().split(/\s+/)[0] || "there";
  return template
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, r.full_name || "there")
    .replace(/\{\{\s*role\s*\}\}/gi, r.role_title || "the role");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();

  if (ids.length === 0) return NextResponse.json({ ok: false, error: "No recipients selected" }, { status: 400 });
  if (!subject) return NextResponse.json({ ok: false, error: "Subject is required" }, { status: 400 });
  if (!message) return NextResponse.json({ ok: false, error: "Message is required" }, { status: 400 });

  try {
    const recipients = await glashQuery<Recipient>(
      `select ra.id, ra.full_name, ra.email, r.title as role_title
       from public.role_applications ra
       left join public.open_roles r on r.id = ra.role_id
       where ra.id = any($1::uuid[]) and ra.email is not null and ra.email <> ''`,
      [ids],
    );

    if (recipients.length === 0) {
      return NextResponse.json({ ok: false, error: "Selected applicants have no email addresses." }, { status: 400 });
    }

    // One pooled transport for the whole batch. Fail fast with a clear message
    // if it isn't usable, instead of hanging on the first send.
    const transporter = createEmailTransport();
    const notReady = await verifyEmailReady(transporter);
    if (notReady) {
      transporter.close();
      return NextResponse.json({ ok: false, error: notReady }, { status: 502 });
    }

    const sent: string[] = [];
    const failed: { email: string; error: string }[] = [];

    // One message per recipient - each person gets their own individual email,
    // never a shared To/CC list, so addresses are never exposed to each other.
    for (const r of recipients) {
      const personalText = personalise(message, r);
      const personalSubject = personalise(subject, r);
      const html = brandedEmailHtml(
        `<div style="white-space:pre-wrap">${personalise(escapeHtml(message), r)}</div>`,
        { eyebrow: "Applicant Screening", preheader: personalSubject },
      );
      try {
        await sendEmail({ to: r.email, subject: personalSubject, text: personalText, html, fromName: "CDS Space", transporter });
        sent.push(r.email);
      } catch (e) {
        failed.push({ email: r.email, error: e instanceof Error ? e.message : "send failed" });
      }
    }
    transporter.close();

    await logActivity({
      action: "application.bulk_email",
      page: "applications",
      resource_type: "role_application",
      resource_label: `Emailed ${sent.length}/${recipients.length}`,
      metadata: { subject, sent: sent.length, failed: failed.length },
    });

    return NextResponse.json({ ok: true, sent: sent.length, failed, total: recipients.length });
  } catch (e) {
    // Always respond with JSON - never let an unhandled throw bubble up to the
    // host, which would return a non-JSON body the client can't parse.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to send emails" },
      { status: 500 },
    );
  }
}
