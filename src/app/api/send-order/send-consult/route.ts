import { NextResponse } from "next/server";
import { sendAdminAlert } from "@/lib/admin-alerts";

/**
 * Public consultation form on the marketing site. Same fix as the order form:
 * it referenced an `emailAttachmentsFor` helper that does not exist, so every
 * submission threw before sending anything.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const text = (...keys: string[]) => {
      for (const key of keys) {
        const found = body[key];
        if (typeof found === "string" && found.trim()) return found.trim();
      }
      return "";
    };
    const name = text("name", "fullName", "full_name", "firstName") || "Someone";
    const email = text("email");

    const sent = await sendAdminAlert({
      kind: "consultation",
      subject: `${name} requested a consultation`,
      details: Object.entries(body).map(([key, entry]) => [
        key.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()),
        typeof entry === "object" ? JSON.stringify(entry) : entry,
      ]),
      actionPath: "/admin/consultations",
      actionLabel: "Open consultations",
      ...(email ? { replyTo: email } : {}),
    });

    return NextResponse.json({ success: sent > 0 });
  } catch (error) {
    console.error("[send-consult] failed:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
