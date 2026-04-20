import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {email} = body;
    console.log("🚀 ~ POST ~ body:", body)

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Quote Request" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "New Quote Request",
      html: `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>
          body { margin:0; padding:0; background:#f4f6fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color:#0b0b0c; }
          .container { max-width:650px; margin:24px auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 8px 30px rgba(2,6,23,0.08); }
          .header { background: linear-gradient(90deg,#1C4ED1 0%,#0046FF 100%); padding:20px 24px; color:#ffffff; text-align:center; }
          .header h1 { margin:0; font-size:20px; letter-spacing:0.2px; }
          .content { padding:20px 24px; }
          .intro { color:#374151; margin-bottom:12px; }
          .details { width:100%; border-collapse:collapse; }
          .row { display:flex; padding:10px 0; border-bottom:1px solid #f1f5f9; }
          .label { width:170px; color:#374151; font-weight:600; }
          .value { color:#111827; flex:1; }
          .description { background:#f8fafc; padding:12px; border-radius:6px; color:#111827; margin-top:8px; }
          .footer { padding:16px 24px; text-align:center; font-size:12px; color:#9aa3b2; }
          @media (max-width:520px) {
            .row { display:block; }
            .label { width:100%; margin-bottom:6px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Quote Request</h1>
          </div>
          <div class="content">
            <p class="intro">You have received a new quote request submitted via the website. See the details below.</p>

            <div>
              <div class="row"><div class="label">Name</div><div class="value">${body.firstName ?? ''} ${body.lastName ?? ''}</div></div>
              <div class="row"><div class="label">Email</div><div class="value">${body.email ?? 'Not provided'}</div></div>
              <div class="row"><div class="label">Country</div><div class="value">${body.country ?? 'Not provided'}</div></div>
              <div class="row"><div class="label">Preferred Time (UTC+1)</div><div class="value">${body.time ?? 'Not provided'}</div></div>
              <div class="row"><div class="label">Company / Project</div><div class="value">${body.company ?? 'Not provided'}</div></div>
              <div class="row"><div class="label">Interest</div><div class="value">${body.interest ?? 'Not provided'}</div></div>
            </div>

            <h3 style="margin-top:18px;margin-bottom:6px;color:#111827;">Project Description</h3>
            <div class="description">${(body.description ?? 'Not provided').replace(/\n/g, '<br/>')}</div>

            <p style="margin-top:18px;color:#374151;">Reply to <strong>${body.email ?? 'the requester'}</strong> to follow up.</p>
          </div>
          <div class="footer">CDS Space — New quote requests are delivered to the recipient email provided.</div>
        </div>
      </body>
      </html>`,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Quote send error:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}