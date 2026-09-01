import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { birthdayCardPng, birthdayGender } from "@/lib/birthday-card-image";
import { BIRTHDAY_CARD_CID, birthdayEmailHtml, birthdayEmailSubject } from "@/lib/birthday-email";
import { sendEmail } from "@/lib/email-from";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Previews or sends the birthday email. The preview returns the exact HTML the
 * recipient will get, with the card inlined as a data: URI so it renders in the
 * admin's browser; sending attaches the same bytes as a CID part.
 */
export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "clients");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const gender = birthdayGender(body.gender);
  const preview = body.preview !== false;
  if (!id) return NextResponse.json({ error: "Client id is required" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Write a message before sending" }, { status: 400 });

  const sb = financeDb();
  const { data: client, error } = await sb
    .from("clients")
    .select("id, name, email")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const name = client.name || "Friend";
  const subject = birthdayEmailSubject(gender);
  const png = await birthdayCardPng(gender, name);

  if (preview) {
    const src = png ? `data:image/png;base64,${png.toString("base64")}` : null;
    return NextResponse.json({
      html: birthdayEmailHtml(gender, message, src),
      subject,
      to: client.email || null,
      card: Boolean(png),
    });
  }

  if (!client.email) return NextResponse.json({ error: "This client has no email address" }, { status: 400 });

  await sendEmail({
    to: client.email,
    subject,
    html: birthdayEmailHtml(gender, message, png ? `cid:${BIRTHDAY_CARD_CID}` : null),
    text: message,
    fromName: "CDS Space",
    attachments: png
      ? [{ filename: "happy-birthday.png", content: png, contentType: "image/png", cid: BIRTHDAY_CARD_CID }]
      : [],
  });

  return NextResponse.json({ ok: true, to: client.email, subject });
}
