import { NextResponse } from "next/server";
import { emailFrom, createEmailTransport } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const transporter = createEmailTransport();

    const mailOptions = {
      from: emailFrom("Order Form"),
      to: process.env.EMAIL_RECEIVER,
      subject: "New Product Order",
      html: brandedEmailHtml(
        `
        <h2 style="margin:0 0 12px;color:#0D1B39;">New Order Received</h2>
        ${Object.keys(body)
          .map(
            (key) =>
              `<p style="margin:4px 0;"><strong>${key}:</strong> ${body[key] ?? "Not provided"}</p>`
          )
          .join("")}
      `,
        { eyebrow: "New Order", preheader: "A new product order was submitted." },
      ),
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email sending error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}