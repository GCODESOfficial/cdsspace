import { NextResponse } from "next/server";
import { emailFrom, createEmailTransport } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";

export async function POST(req: Request) {
  const formData = await req.json();

  const transporter = createEmailTransport();

  const adminEmail = {
    from: emailFrom("CDS Form"),
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
    from: emailFrom("CDS Space"),
    to: formData.email,
    subject: "Thanks for Submitting Your Brand Identity Brief!",
    html: brandedEmailHtml(
      `
        <h2 style="margin:0 0 12px;color:#0D1B39;">Hi ${formData.addressName || "there"},</h2>
        <p>Thank you for filling out our Brand Identity Brief!</p>
        <p>Your submission has been received. Our team will review the details and begin crafting your brand's visual identity.</p>
        <p>If we need any clarification, we'll reach out to you at <strong>${formData.email}</strong>.</p>
        <p style="margin-top:16px;">Warm regards,<br/><strong>CDS Space</strong></p>
      `,
      { eyebrow: "Brand Identity Brief", preheader: "We've received your brand brief." },
    ),
  };

  try {
    await transporter.sendMail({ ...adminEmail, attachments: emailAttachmentsFor((adminEmail as { html?: string }).html) });
    await transporter.sendMail({ ...userEmail, attachments: emailAttachmentsFor(userEmail.html) });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email sending failed:", error);
    return NextResponse.json({ success: false, error: "Failed to send emails" });
  }
}
