import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Consultation Form" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_RECEIVER,
      subject: "New Consultation Request",
      html: `
        <h2>New Consultation Submitted</h2>
        ${Object.keys(body)
          .map(
            (key) =>
              `<p><strong>${key}:</strong> ${body[key] ?? "Not provided"}</p>`
          )
          .join("")}
      `,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Consult send error:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}