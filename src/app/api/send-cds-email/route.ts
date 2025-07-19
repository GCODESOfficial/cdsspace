import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  const formData = await req.json();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const adminEmail = {
    from: `"CDS Form" <${process.env.EMAIL_USER}>`,
    to: "contact.cdsspace@gmail.com",
    subject: `New CDS Brand Identity Brief from ${formData.addressName || "User"}`,
    text: `
A new user has submitted the Brand Identity Brief form.

Name: ${formData.addressName}
Email: ${formData.email}
Brand Name: ${formData.brandName}
What You Do: ${formData.whatYouDo}
Audience: ${formData.audience}
Logo Style: ${formData.logoStyle}
Logo Vibes: ${formData.logoVibes?.join(", ")}
Colors Like: ${formData.coloursLike}
Colors Avoid: ${formData.coloursAvoid}
Font Styles: ${formData.fontStyles?.join(", ")}
Admired Logos: ${formData.admiredLogos}
Top Competitors: ${formData.topCompetitors}
Unique Edge: ${formData.uniqueEdge}
Tagline: ${formData.tagline}
Usage Locations: ${formData.usageLocations}
Symbols/Ideas: ${formData.symbolsIdeas}
Gift Recipient Name: ${formData.giftRecipientName}
Gift Recipient Email: ${formData.giftRecipientEmail}
Delivery Options: ${formData.giftDeliveryOptions?.join(", ")}
`,
  };

  const userEmail = {
    from: `"CDS Space" <${process.env.EMAIL_USER}>`,
    to: formData.email,
    subject: "Thanks for Submitting Your Brand Identity Brief!",
    html: `
      <div style="font-family: sans-serif; color: #333;">
        <h2>Hi ${formData.addressName || "there"},</h2>
        <p>Thank you for filling out our Brand Identity Brief!</p>
        <p>Your submission has been received. Our team will review the details and begin crafting your brand's visual identity.</p>
        <p>If we need any clarification, we’ll reach out to you at <strong>${formData.email}</strong>.</p>
        <br/>
        <p>Warm regards,</p>
        <p><strong>CDS Space</strong></p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(adminEmail);
    await transporter.sendMail(userEmail);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email sending failed:", error);
    return NextResponse.json({ success: false, error: "Failed to send emails" });
  }
}
