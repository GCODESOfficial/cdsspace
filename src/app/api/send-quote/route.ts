import { NextResponse } from "next/server";
import { emailFrom, createEmailTransport } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {email} = body;
    console.log("🚀 ~ POST ~ body:", body)

    const transporter = createEmailTransport();

    const row = (label: string, value: string) =>
      `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#374151;font-weight:600;width:180px;vertical-align:top;">${label}</td><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#111827;">${value}</td></tr>`;

    const mailOptions = {
      from: emailFrom("Quote Request"),
      to: email,
      subject: "New Quote Request",
      html: brandedEmailHtml(
        `
        <h2 style="margin:0 0 12px;color:#0D1B39;">New Quote Request</h2>
        <p style="margin:0 0 12px;color:#374151;">A new quote request was submitted via the website. Details below.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${row("Name", `${body.firstName ?? ""} ${body.lastName ?? ""}`)}
          ${row("Email", body.email ?? "Not provided")}
          ${row("Country", body.country ?? "Not provided")}
          ${row("Preferred Time (UTC+1)", body.time ?? "Not provided")}
          ${row("Company / Project", body.company ?? "Not provided")}
          ${row("Interest", body.interest ?? "Not provided")}
        </table>
        <h3 style="margin:18px 0 6px;color:#111827;">Project Description</h3>
        <div style="background:#f8fafc;padding:12px;border-radius:6px;color:#111827;">${(body.description ?? "Not provided").replace(/\n/g, "<br/>")}</div>
        <p style="margin-top:18px;color:#374151;">Reply to <strong>${body.email ?? "the requester"}</strong> to follow up.</p>
      `,
        { eyebrow: "Quote Request", preheader: "A new quote request was submitted." },
      ),
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Quote send error:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}