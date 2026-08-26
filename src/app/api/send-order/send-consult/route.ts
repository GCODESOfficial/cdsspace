import { NextResponse } from "next/server";
import { emailFrom, createEmailTransport } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const transporter = createEmailTransport();

    const mailOptions = {
      from: emailFrom("Consultation Form"),
      to: process.env.EMAIL_RECEIVER,
      subject: "New Consultation Request",
      html: brandedEmailHtml(
        `
        <h2 style="margin:0 0 12px;color:#0D1B39;">New Consultation Submitted</h2>
        ${Object.keys(body)
          .map(
            (key) =>
              `<p style="margin:4px 0;"><strong>${key}:</strong> ${body[key] ?? "Not provided"}</p>`
          )
          .join("")}
      `,
        { eyebrow: "New Consultation", preheader: "A new consultation request was submitted." },
      ),
    };

    await transporter.sendMail({ ...mailOptions, attachments: emailAttachmentsFor(mailOptions.html) });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Consult send error:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}